export type FeatureType = 'lake' | 'reach';
export type FeatureFilter = FeatureType;
export type SpatialMode = 'individual' | 'subbasins';
export type MetricMode = 'relative' | 'absolute';
export type ThemeMode = 'light' | 'dark';
export type SupportClass = 'standard' | 'limited' | 'insufficient';

export interface ArtifactMetadata {
  path: string;
  bytes: number;
  sha256: string;
  format?: string;
  virtual_path?: string;
}

export interface WindowMetadata {
  id: string;
  period_start: string;
  period_end: string;
  feature_count: number;
  publishable_count: number;
  support_counts: Record<string, Record<string, number>>;
  web: ArtifactMetadata;
}

export interface Manifest {
  schema_version: number;
  project: string;
  region: string;
  generated_at: string;
  target_year: number;
  default_window: string;
  method: {
    version: string;
    product_version: string;
    reference_start: string;
    lake_max_quality: number;
    reach_max_quality: number;
  };
  counts: {
    features: number;
    period_rows: number;
    publishable_rows: number;
  };
  artifacts: {
    entities: ArtifactMetadata;
    period_metrics: ArtifactMetadata;
    geometry_pmtiles?: ArtifactMetadata;
    timeseries_index?: ArtifactMetadata;
    feature_index?: ArtifactMetadata;
    field_index?: ArtifactMetadata;
  };
  windows: WindowMetadata[];
  basins?: {
    level: number;
    polygon_path: string;
    windows: Record<string, string>;
    timeseries_index: string;
    feature_assignments: number;
    timeseries_count: number;
  };
}

export interface WindowFeature {
  feature_type: FeatureType;
  feature_id: string;
  name: string | null;
  lon: number;
  lat: number;
  relative_index: number | null;
  anomaly_m: number | null;
  period_n: number;
  period_good_n: number;
  period_suspect_n: number;
  period_first_date: string | null;
  period_last_date: string | null;
  baseline_n: number;
  baseline_years_n: number;
  below_baseline_minimum: boolean;
  above_baseline_maximum: boolean;
  support_class: SupportClass;
  publishable: boolean;
}

export interface WindowPayload {
  schema_version: number;
  window_id: string;
  period_start: string;
  period_end: string;
  method_version: string;
  feature_count: number;
  publishable_count: number;
  features: WindowFeature[];
  tile_signature?: string;
}


export interface DroughtFieldSurface {
  window_id: string;
  feature_filter: FeatureFilter;
  metric_mode: MetricMode;
  domain: number;
  source_count: number;
  tile_path_template: string;
}

export interface DroughtFieldIndex {
  schema_version: number;
  encoding: 'mapbox';
  tile_size: number;
  minzoom: number;
  maxzoom: number;
  bounds: [number, number, number, number];
  value_scale: number;
  interpolation: {
    method: string;
    power: number;
    neighbors: number;
    working_crs: string;
  };
  surfaces: DroughtFieldSurface[];
}

export interface SpatialTileIndex {
  schema_version: number;
  tile_zoom: number;
  tile_path_template: string;
  feature_count: number;
  tile_count: number;
  tiles: string[];
}

export interface TimeseriesObservation {
  time: string;
  wse_m: number;
  seasonal_baseline_m: number | null;
  seasonal_q25_m: number | null;
  seasonal_q50_m: number | null;
  seasonal_q75_m: number | null;
  anomaly_m: number | null;
  relative_index: number | null;
  quality: number;
}

export type BaselineProfilePoint = [
  day: number,
  q25_m: number | null,
  q50_m: number | null,
  q75_m: number | null,
];

export interface TimeseriesFeature {
  name: string | null;
  baseline_profile: BaselineProfilePoint[];
  observations: TimeseriesObservation[];
}

export interface TimeseriesTilePayload {
  schema_version: number;
  method_version: string;
  features: Record<string, TimeseriesFeature>;
}

export interface BasinFeature {
  basin_id: string;
  feature_type: FeatureType;
  relative_index: number;
  median_anomaly_m?: number | null;
  feature_count: number;
  observation_count: number;
}

export interface BasinWindow {
  schema_version: number;
  window_id: string;
  basins: BasinFeature[];
}

export interface BasinGeometry {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: {basin_id: string};
    geometry: unknown;
  }>;
}

export interface BasinTimeseries {
  schema_version: number;
  basin_id: string;
  feature_type: FeatureType;
  baseline_profile: BaselineProfilePoint[];
  observations: Array<{
    time: string;
    relative_index: number;
    feature_count: number;
    q25?: number;
    q75?: number;
  }>;
}

export interface PortalState {
  manifest: Manifest | null;
  windowPayload: WindowPayload | null;
  windowId: string | null;
  metricMode: MetricMode;
  featureFilter: FeatureFilter;
  spatialMode: SpatialMode;
  basinGeometry: BasinGeometry | null;
  basinWindow: BasinWindow | null;
  selectedBasin: BasinFeature | null;
  selectedBasinTimeseries: BasinTimeseries | null;
  theme: ThemeMode;
  selectedFeature: WindowFeature | null;
  selectedTimeseries: TimeseriesFeature | null;
  zoom: number;
}
