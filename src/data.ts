import type {
  BasinGeometry, BasinTimeseries, BasinWindow, DroughtFieldIndex,
  DroughtFieldSurface, Manifest, TimeseriesFeature, WindowFeature, WindowPayload,
} from './types';
import {
  ChunkedPmtilesSource, readRecord,
  type ChunkedPmtilesIndex, type RangeStoreIndex, type RecordLocation,
} from './range-store';
import {PMTiles, Protocol} from 'pmtiles';

const dataBaseUrl = (import.meta.env.VITE_DATA_BASE_URL ?? './data').replace(/\/$/, '');
let publicationRevision = '';
let fieldIndexCache: DroughtFieldIndex | null = null;
let featureIndexCache: RangeStoreIndex | null = null;
let timeseriesIndexCache: RangeStoreIndex | null = null;
const windowIndexes = new Map<string, RangeStoreIndex & {
  window_id: string; period_start: string; period_end: string;
  method_version: string; feature_count: number; publishable_count: number;
}>();
const tileDataCache = new Map<string, WindowFeature[]>();
const pendingTiles = new Map<string, Promise<WindowFeature[]>>();
const staticTileCache = new Map<string, StaticRecord[]>();
const timeseriesTileDirectories = new Map<string, Record<string, RecordLocation>>();
const timeseriesFeatureCache = new Map<string, TimeseriesFeature>();

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return (await response.json()) as T;
}

export function artifactUrl(path: string): string {
  const pathname = `${dataBaseUrl}/${path.replace(/^\//, '')}`;
  return publicationRevision && path
    ? `${pathname}?v=${encodeURIComponent(publicationRevision)}` : pathname;
}

function toTile(lon: number, lat: number, zoom: number): [number, number] {
  const n = 2 ** zoom;
  const radians = Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 180;
  return [Math.max(0, Math.min(n - 1, Math.floor((lon + 180) / 360 * n))),
    Math.max(0, Math.min(n - 1, Math.floor((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * n)))];
}

export function visibleTileKeys(
  bounds: {west: number; south: number; east: number; north: number},
  zoom: number,
): string[] {
  const [x0, y1] = toTile(bounds.west, bounds.south, zoom);
  const [x1, y0] = toTile(bounds.east, bounds.north, zoom);
  const keys: string[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) keys.push(`${x}/${y}`);
  }
  return keys;
}

export async function loadManifest(): Promise<Manifest> {
  const response = await fetch(artifactUrl('manifest.json'), {cache: 'no-cache'});
  if (!response.ok) throw new Error(`Cannot read publication manifest: ${response.status}`);
  const manifest = await response.json() as Manifest;
  publicationRevision = manifest.generated_at;
  return manifest;
}

export async function loadFieldIndex(manifest: Manifest): Promise<DroughtFieldIndex> {
  if (fieldIndexCache) return fieldIndexCache;
  const artifact = manifest.artifacts.field_index;
  if (!artifact) throw new Error('Missing drought field index.');
  fieldIndexCache = await fetchJson<DroughtFieldIndex>(artifactUrl(artifact.path));
  return fieldIndexCache;
}

export function fieldTileTemplate(surface: DroughtFieldSurface): string {
  let template = surface.tile_path_template;
  for (const [placeholder, sentinel] of [
    ['{z}', '__Z__'], ['{x}', '__X__'], ['{y}', '__Y__'],
  ]) template = template.replaceAll(placeholder, sentinel);
  template = new URL(artifactUrl(template), window.location.href).href;
  for (const [placeholder, sentinel] of [
    ['{z}', '__Z__'], ['{x}', '__X__'], ['{y}', '__Y__'],
  ]) template = template.replaceAll(sentinel, placeholder);
  return template;
}

export function geometryPmtilesUrl(manifest: Manifest): string {
  const artifact = manifest.artifacts.geometry_pmtiles;
  if (!artifact) throw new Error('Missing geometry PMTiles.');
  return new URL(artifact.virtual_path ?? artifact.path,
    new URL(artifactUrl(''), window.location.href)).href;
}

export async function registerGeometrySource(
  manifest: Manifest,
  protocol: Protocol,
): Promise<void> {
  const artifact = manifest.artifacts.geometry_pmtiles;
  if (!artifact) throw new Error('Missing geometry PMTiles.');
  if (artifact.format !== 'chunked_pmtiles_v1') return;
  const index = await fetchJson<ChunkedPmtilesIndex>(artifactUrl(artifact.path));
  protocol.add(new PMTiles(new ChunkedPmtilesSource(
    geometryPmtilesUrl(manifest), index, artifactUrl,
  )));
}

async function featureIndex(manifest: Manifest): Promise<RangeStoreIndex> {
  if (featureIndexCache) return featureIndexCache;
  if (!manifest.artifacts.feature_index) throw new Error('Missing spatial feature index.');
  featureIndexCache = await fetchJson<RangeStoreIndex>(
    artifactUrl(manifest.artifacts.feature_index.path),
  );
  return featureIndexCache;
}

async function windowIndex(manifest: Manifest, windowId: string) {
  const cached = windowIndexes.get(windowId);
  if (cached) return cached;
  const metadata = manifest.windows.find((item) => item.id === windowId);
  if (!metadata) throw new Error(`Unknown period: ${windowId}`);
  const index = await fetchJson<RangeStoreIndex & {
    window_id: string; period_start: string; period_end: string;
    method_version: string; feature_count: number; publishable_count: number;
  }>(artifactUrl(metadata.web.path));
  if (index.format !== 'range-gzip-v1') throw new Error('Incompatible window publication format.');
  windowIndexes.set(windowId, index);
  return index;
}

export async function loadWindow(manifest: Manifest, windowId: string): Promise<WindowPayload> {
  const index = await windowIndex(manifest, windowId);
  return {
    schema_version: index.schema_version,
    window_id: index.window_id,
    period_start: index.period_start,
    period_end: index.period_end,
    method_version: index.method_version,
    feature_count: index.feature_count,
    publishable_count: index.publishable_count,
    features: [],
  };
}

type StaticRecord = [WindowFeature['feature_type'], string, string | null, number, number];
type MetricRecord = [WindowFeature['feature_type'], string, number | null, number | null,
  number, number, number, string | null, string | null, number, number,
  boolean, boolean, WindowFeature['support_class'], boolean];

async function readWindowTile(
  base: RangeStoreIndex, metrics: RangeStoreIndex, key: string, windowId: string,
): Promise<WindowFeature[]> {
  const cacheKey = `${windowId}:${key}`;
  const cached = tileDataCache.get(cacheKey);
  if (cached) return cached;
  const metricLocation = metrics.tiles[key];
  const staticLocation = base.tiles[key];
  if (!metricLocation || !staticLocation) return [];
  const [staticRows, metricRows] = await Promise.all([
    staticTileCache.get(key) ?? readRecord<StaticRecord[]>(base, staticLocation, artifactUrl),
    readRecord<MetricRecord[]>(metrics, metricLocation, artifactUrl),
  ]);
  staticTileCache.set(key, staticRows);
  const staticById = new Map(staticRows.map((row) => [`${row[0]}:${row[1]}`, row]));
  const features: WindowFeature[] = metricRows.flatMap((row) => {
    const entry = staticById.get(`${row[0]}:${row[1]}`);
    if (!entry) return [];
    return [{
      feature_type: row[0], feature_id: row[1], name: entry[2],
      lon: entry[3], lat: entry[4], relative_index: row[2], anomaly_m: row[3],
      period_n: row[4], period_good_n: row[5], period_suspect_n: row[6],
      period_first_date: row[7], period_last_date: row[8],
      baseline_n: row[9], baseline_years_n: row[10],
      below_baseline_minimum: row[11], above_baseline_maximum: row[12],
      support_class: row[13], publishable: row[14],
    }];
  });
  tileDataCache.set(cacheKey, features);
  if (tileDataCache.size > 80) tileDataCache.delete(tileDataCache.keys().next().value!);
  return features;
}

function loadWindowTile(
  base: RangeStoreIndex, metrics: RangeStoreIndex, key: string, windowId: string,
): Promise<WindowFeature[]> {
  const cacheKey = `${windowId}:${key}`;
  const cached = tileDataCache.get(cacheKey);
  if (cached) return Promise.resolve(cached);
  const pending = pendingTiles.get(cacheKey);
  if (pending) return pending;
  const task = readWindowTile(base, metrics, key, windowId)
    .finally(() => pendingTiles.delete(cacheKey));
  pendingTiles.set(cacheKey, task);
  return task;
}

export async function loadVisibleWindow(
  manifest: Manifest, windowId: string,
  bounds: {west: number; south: number; east: number; north: number},
): Promise<WindowPayload> {
  const [base, metrics] = await Promise.all([
    featureIndex(manifest), windowIndex(manifest, windowId),
  ]);
  const keys = visibleTileKeys(bounds, base.tile_zoom)
    .filter((key) => Boolean(base.tiles[key] && metrics.tiles[key]));
  const tiles: WindowFeature[][] = [];
  // Bound concurrent range requests to avoid overloading GitHub Pages.
  for (let position = 0; position < keys.length; position += 4) {
    tiles.push(...await Promise.all(keys.slice(position, position + 4).map((key) =>
      loadWindowTile(base, metrics, key, windowId))));
  }
  return {
    ...await loadWindow(manifest, windowId),
    features: tiles.flat(),
    tile_signature: keys.join(','),
  };
}

async function timeseriesIndex(manifest: Manifest): Promise<RangeStoreIndex> {
  if (timeseriesIndexCache) return timeseriesIndexCache;
  if (!manifest.artifacts.timeseries_index) throw new Error('Missing time-series index.');
  timeseriesIndexCache = await fetchJson<RangeStoreIndex>(
    artifactUrl(manifest.artifacts.timeseries_index.path),
  );
  return timeseriesIndexCache;
}

export async function loadFeatureTimeseries(
  manifest: Manifest, feature: WindowFeature,
): Promise<TimeseriesFeature> {
  const featureKey = `${feature.feature_type}:${feature.feature_id}`;
  const cached = timeseriesFeatureCache.get(featureKey);
  if (cached) return cached;
  const index = await timeseriesIndex(manifest);
  const [x, y] = toTile(feature.lon, feature.lat, index.tile_zoom);
  const tileKey = `${x}/${y}`;
  const location = index.tiles[tileKey];
  if (!location) return {name: feature.name, baseline_profile: [], observations: []};
  let directory = timeseriesTileDirectories.get(tileKey);
  if (!directory) {
    directory = await readRecord<Record<string, RecordLocation>>(
      index, location, artifactUrl,
    );
    timeseriesTileDirectories.set(tileKey, directory);
  }
  const entry = directory[featureKey];
  if (!entry) return {name: feature.name, baseline_profile: [], observations: []};
  const series = await readRecord<TimeseriesFeature>(index, entry, artifactUrl);
  series.name = feature.name;
  timeseriesFeatureCache.set(featureKey, series);
  if (timeseriesFeatureCache.size > 32) {
    timeseriesFeatureCache.delete(timeseriesFeatureCache.keys().next().value!);
  }
  return series;
}

const basinWindowCache = new Map<string, BasinWindow>();
let basinGeometryCache: BasinGeometry | null = null;
let basinTimeseriesIndex: (RangeStoreIndex & {records: Record<string, RecordLocation>}) | null = null;
const basinTimeseriesCache = new Map<string, BasinTimeseries>();

export async function loadBasinGeometry(manifest: Manifest): Promise<BasinGeometry> {
  if (basinGeometryCache) return basinGeometryCache;
  if (!manifest.basins) throw new Error('Subbasin data have not been published.');
  basinGeometryCache = await fetchJson<BasinGeometry>(artifactUrl(manifest.basins.polygon_path));
  return basinGeometryCache;
}

export async function loadBasinWindow(manifest: Manifest, windowId: string): Promise<BasinWindow> {
  const cached = basinWindowCache.get(windowId);
  if (cached) return cached;
  const path = manifest.basins?.windows[windowId];
  if (!path) throw new Error(`No Level 5 data for ${windowId}.`);
  const payload = await fetchJson<BasinWindow>(artifactUrl(path));
  basinWindowCache.set(windowId, payload);
  return payload;
}

export async function loadBasinTimeseries(
  manifest: Manifest, basinId: string, featureType: 'lake' | 'reach',
): Promise<BasinTimeseries> {
  const key = `${featureType}:${basinId}`;
  const cached = basinTimeseriesCache.get(key);
  if (cached) return cached;
  if (!manifest.basins) throw new Error('Subbasin data have not been published.');
  if (!basinTimeseriesIndex) {
    basinTimeseriesIndex = await fetchJson<RangeStoreIndex & {
      records: Record<string, RecordLocation>;
    }>(artifactUrl(manifest.basins.timeseries_index));
  }
  const entry = basinTimeseriesIndex.records[key];
  if (!entry) return {schema_version: 1, basin_id: basinId, feature_type: featureType,
    baseline_profile: [], observations: []};
  const series = await readRecord<BasinTimeseries>(
    basinTimeseriesIndex, entry, artifactUrl,
  );
  basinTimeseriesCache.set(key, series);
  return series;
}
