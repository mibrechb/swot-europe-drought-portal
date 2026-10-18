/** Read independently gzipped JSON records from bounded, range-addressable files. */

export type RecordLocation = [part: number, offset: number, length: number];

export interface RangeStoreIndex {
  schema_version: number;
  format: 'range-gzip-v1';
  tile_zoom: number;
  part_path_template: string;
  part_sizes: number[];
  tiles: Record<string, RecordLocation>;
}

const MAX_WHOLE_FILE_FALLBACK = 1024 * 1024;
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

/** Retrieve one byte range, validating both the response and its index bounds. */
export async function fetchByteRange(
  url: string,
  offset: number,
  length: number,
  signal?: AbortSignal,
  totalLength?: number,
): Promise<ArrayBuffer> {
  if (!Number.isSafeInteger(offset) || offset < 0
    || !Number.isSafeInteger(length) || length <= 0) {
    throw new Error(`Invalid HTTP byte range ${offset}+${length} for ${url}`);
  }
  if (totalLength !== undefined && (!Number.isSafeInteger(totalLength)
    || offset + length > totalLength)) {
    throw new Error(`Publication index references bytes ${offset}-${offset + length - 1} `
      + `outside ${url} (indexed file size ${totalLength}). `
      + 'Run npm run verify:data and synchronize the publication.');
  }
  const requestedEnd = offset + length - 1;
  const range = `bytes=${offset}-${requestedEnd}`;
  let failure: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal?.aborted) throw new DOMException('Range request aborted', 'AbortError');
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {Range: range},
        signal,
        ...(attempt === 1 ? {cache: 'no-store' as RequestCache} : {}),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      failure = `Network error: ${String(error)}`;
      continue;
    }
    if (response.status === 206) {
      const contentRange = response.headers.get('content-range');
      const buffer = await response.arrayBuffer();
      const parsed = contentRange?.match(/^bytes (\d+)-(\d+)\/(\d+|\*)$/i);
      const headerValid = !contentRange || (parsed !== null && parsed !== undefined
        && Number(parsed[1]) === offset
        && Number(parsed[2]) === requestedEnd
        && (totalLength === undefined || parsed[3] === '*'
          || Number(parsed[3]) === totalLength));
      if (buffer.byteLength === length && headerValid) return buffer;
      failure = `Incomplete HTTP range: ${buffer.byteLength}/${length} bytes; `
        + `Content-Range: ${contentRange ?? 'not exposed'}; `
        + `indexed file size: ${totalLength ?? 'unknown'}`;
      continue;
    }
    if (response.status === 200) {
      // A static host may ignore Range for tiny fixtures, but do not silently
      // download a multi-megabyte archive when only a few KB were requested.
      const reportedSize = Number(response.headers.get('content-length'));
      if (reportedSize > MAX_WHOLE_FILE_FALLBACK
        || (totalLength ?? 0) > MAX_WHOLE_FILE_FALLBACK) {
        await response.body?.cancel();
        throw new Error(`Host ignored ${range} from ${url}. HTTP Range support is required.`);
      }
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength <= MAX_WHOLE_FILE_FALLBACK
        && (totalLength === undefined || totalLength === buffer.byteLength)
        && offset + length <= buffer.byteLength) {
        return buffer.slice(offset, offset + length);
      }
      failure = `Host ignored ${range}; response contained ${buffer.byteLength} bytes`;
      continue;
    }
    failure = `HTTP ${response.status} ${response.statusText}`;
    if (!RETRYABLE_STATUSES.has(response.status)) break;
  }
  throw new Error(`Unable to read ${range} from ${url}: ${failure}. `
    + 'Check that the feature index and chunk files belong to the same publication '
    + '(npm run verify:data; npm run data:sync), then reload the page.');
}

export async function readRecord<T>(
  index: RangeStoreIndex,
  location: RecordLocation,
  assetUrl: (path: string) => string,
): Promise<T> {
  const [part, offset, length] = location;
  const path = index.part_path_template.replace('{part}', String(part).padStart(4, '0'));
  const data = await fetchByteRange(assetUrl(path), offset, length, undefined,
    index.part_sizes[part]);
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text()) as T;
}

export interface ChunkedPmtilesIndex {
  format: 'chunked_pmtiles_v1';
  chunk_bytes: number;
  total_bytes: number;
  parts: number[];
  part_path_template: string;
}

/** Implementation of the PMTiles Source interface backed by split byte ranges. */
export class ChunkedPmtilesSource {
  constructor(
    private readonly logicalUrl: string,
    private readonly index: ChunkedPmtilesIndex,
    private readonly assetUrl: (path: string) => string,
  ) {}

  getKey(): string {
    return this.logicalUrl;
  }

  async getBytes(offset: number, length: number, signal?: AbortSignal): Promise<{data: ArrayBuffer}> {
    if (!Number.isSafeInteger(offset) || length <= 0
      || offset < 0 || offset + length > this.index.total_bytes) {
      throw new Error(`Invalid PMTiles range ${offset}+${length}`);
    }
    const segments: Array<Promise<ArrayBuffer>> = [];
    let position = offset;
    while (position < offset + length) {
      const part = Math.floor(position / this.index.chunk_bytes);
      const partOffset = position - part * this.index.chunk_bytes;
      const segmentLength = Math.min(length - (position - offset),
        this.index.parts[part] - partOffset);
      if (segmentLength <= 0) throw new Error('Invalid PMTiles part directory.');
      const path = this.index.part_path_template.replace(
        '{part}', String(part).padStart(4, '0'),
      );
      segments.push(fetchByteRange(this.assetUrl(path), partOffset, segmentLength,
        signal, this.index.parts[part]));
      position += segmentLength;
    }
    const blocks = await Promise.all(segments);
    const combined = new Uint8Array(length);
    let cursor = 0;
    for (const block of blocks) {
      combined.set(new Uint8Array(block), cursor);
      cursor += block.byteLength;
    }
    return {data: combined.buffer};
  }
}
