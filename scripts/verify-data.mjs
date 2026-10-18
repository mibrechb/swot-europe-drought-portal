/** Check that immutable publication indexes match the copied binary files. */
import {open, readFile, stat} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {gunzipSync} from 'node:zlib';
import process from 'node:process';

const root = resolve(process.env.SWOT_DROUGHT_PORTAL_DATA_DIR
  ?? resolve(import.meta.dirname, '..', 'public', 'data'));
let indexes = 0;
let records = 0;
let checks = 0;
const failures = [];

async function json(relativePath) {
  return JSON.parse(await readFile(join(root, relativePath), 'utf8'));
}

function recordError(message) {
  failures.push(message);
  console.error(`FAIL: ${message}`);
}

async function sizeOf(relativePath) {
  return (await stat(join(root, relativePath))).size;
}

async function sampleRecord(relativePath, [part, offset, length]) {
  const file = await open(join(root, relativePath), 'r');
  try {
    const bytes = Buffer.alloc(length);
    const {bytesRead} = await file.read(bytes, 0, length, offset);
    if (bytesRead !== length) throw new Error(`read ${bytesRead}/${length} bytes`);
    JSON.parse(gunzipSync(bytes).toString('utf8'));
    checks++;
  } finally {
    await file.close();
  }
}

async function verifyRangeIndex(indexPath) {
  const index = await json(indexPath);
  if (index.format !== 'range-gzip-v1') throw new Error(`Unexpected format in ${indexPath}`);
  const entries = Object.entries(index.tiles ?? index.records ?? {});
  const samples = new Map();
  for (const [key, location] of entries) {
    records++;
    if (!Array.isArray(location) || location.length !== 3) {
      recordError(`${indexPath}: invalid location for ${key}`);
      continue;
    }
    const [part, offset, length] = location;
    if (!Number.isSafeInteger(part) || part < 0 || part >= index.part_sizes.length
      || !Number.isSafeInteger(offset) || offset < 0
      || !Number.isSafeInteger(length) || length <= 0
      || offset + length > index.part_sizes[part]) {
      recordError(`${indexPath}: ${key} has out-of-bounds byte range ${location}`);
      continue;
    }
    if (!samples.has(part)) samples.set(part, []);
    const partSamples = samples.get(part);
    if (partSamples.length === 0) partSamples.push(location);
    else if (offset > partSamples[partSamples.length - 1][1]) {
      if (partSamples.length === 1) partSamples.push(location);
      else partSamples[1] = location;
    }
  }
  for (let part = 0; part < index.part_sizes.length; part++) {
    const relativePath = index.part_path_template.replace('{part}', String(part).padStart(4, '0'));
    const expected = index.part_sizes[part];
    try {
      const actual = await sizeOf(relativePath);
      if (actual !== expected) {
        recordError(`${relativePath}: actual size ${actual}, index expects ${expected}`);
        continue;
      }
      for (const location of samples.get(part) ?? []) {
        try {
          await sampleRecord(relativePath, location);
        } catch (error) {
          recordError(`${relativePath} at ${location[1]}+${location[2]}: ${String(error)}`);
        }
      }
    } catch (error) {
      recordError(`${relativePath}: ${String(error)}`);
    }
  }
  indexes++;
}

async function verifyGeometry() {
  const index = await json('latest/geometry/index.json');
  if (index.format !== 'chunked_pmtiles_v1') throw new Error('Unexpected geometry format');
  let total = 0;
  for (let part = 0; part < index.parts.length; part++) {
    const path = index.part_path_template.replace('{part}', String(part).padStart(4, '0'));
    try {
      const actual = await sizeOf(path);
      if (actual !== index.parts[part]) {
        recordError(`${path}: actual size ${actual}, index expects ${index.parts[part]}`);
      }
      total += actual;
    } catch (error) {
      recordError(`${path}: ${String(error)}`);
    }
  }
  if (total !== index.total_bytes) {
    recordError(`geometry archive: total size ${total}, index expects ${index.total_bytes}`);
  }
  indexes++;
}

try {
  const manifest = await json('manifest.json');
  await verifyGeometry();
  const indexPaths = [
    manifest.artifacts.feature_index?.path,
    manifest.artifacts.timeseries_index?.path,
    ...manifest.windows.map((window) => window.web.path),
    manifest.basins?.timeseries_index,
  ].filter(Boolean);
  for (const path of indexPaths) await verifyRangeIndex(path);
  console.log(`Verified ${indexes} indexes and ${records} indexed record locations; `
    + `decompressed ${checks} sample records. Root: ${root}`);
  if (failures.length) {
    console.error(`${failures.length} publication integrity issue(s). Re-run npm run data:sync `
      + 'after the pipeline finishes, then refresh the browser.');
    process.exitCode = 1;
  } else {
    console.log('Publication files and index sizes match.');
  }
} catch (error) {
  console.error(`Could not verify published data: ${String(error)}`);
  process.exitCode = 1;
}
