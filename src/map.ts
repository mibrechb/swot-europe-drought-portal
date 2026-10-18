import {
  AttributionControl,
  GeoJSONSource,
  Map as MapLibreMap,
  NavigationControl,
  RasterDEMTileSource,
} from 'maplibre-gl';
import {basemapStyle} from './basemap';
import type {
  BasinFeature,
  BasinGeometry,
  BasinWindow,
  SpatialMode,
  DroughtFieldIndex,
  DroughtFieldSurface,
  FeatureFilter,
  MetricMode,
  ThemeMode,
  WindowFeature,
  WindowPayload,
} from './types';

const BASIN_SOURCE_ID = 'drought-basins';
const BASIN_FILL_ID = 'drought-basin-fill';
const BASIN_LINE_ID = 'drought-basin-boundary';
const FIELD_SOURCE_ID = 'drought-field';
const FIELD_LAYER_ID = 'drought-interpolated-surface';
const CENTROID_SOURCE_ID = 'drought-centroids';
const LAKE_CENTROID_LAYER_ID = 'drought-lake-centroids';
const REACH_CENTROID_LAYER_ID = 'drought-reach-centroids';
const GEOMETRY_SOURCE_ID = 'drought-geometry';
const LAKE_FILL_LAYER_ID = 'drought-lake-fill';
const LAKE_LINE_LAYER_ID = 'drought-lake-line';
const REACH_LINE_LAYER_ID = 'drought-reach-line';
const OCEAN_MASK_LAYER_ID = 'drought-ocean-mask';
const GEOMETRY_SOURCE_LAYERS = ['lakes', 'reaches'] as const;

interface MapCallbacks {
  onFeatureClick: (feature: WindowFeature) => void;
  onBasinClick: (basin: BasinFeature) => void;
  onBasinHover: (basin: BasinFeature | null, x: number, y: number) => void;
  onFeatureHover: (feature: WindowFeature | null, x: number, y: number) => void;
  onZoom: (zoom: number) => void;
}

interface RenderOptions {
  payload: WindowPayload;
  metricMode: MetricMode;
  featureFilter: FeatureFilter;
  spatialMode: SpatialMode;
  basinGeometry: BasinGeometry | null;
  basinWindow: BasinWindow | null;
}

function featureKey(featureType: string, featureId: string): string {
  return `${featureType}:${featureId}`;
}

function matchesFilter(feature: WindowFeature, featureFilter: FeatureFilter): boolean {
  return feature.feature_type === featureFilter;
}

function metricValue(feature: WindowFeature, metricMode: MetricMode): number | null {
  const value = metricMode === 'relative' ? feature.relative_index : feature.anomaly_m;
  return value !== null && Number.isFinite(value) ? value : null;
}

function metricDomain(features: WindowFeature[], metricMode: MetricMode): number {
  if (metricMode === 'relative') return 2.5;
  const values = features
    .map((feature) => metricValue(feature, metricMode))
    .filter((value): value is number => value !== null)
    .map((value) => Math.abs(value))
    .filter((value) => value > 0)
    .sort((left, right) => left - right);
  if (values.length === 0) return 1;
  const percentileIndex = Math.min(values.length - 1, Math.floor(values.length * 0.95));
  return Math.max(0.25, values[percentileIndex]);
}

function fieldOpacityExpression(theme: ThemeMode): unknown[] {
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    2.8,
    theme === 'dark' ? 1 : 0.94,
    5.4,
    theme === 'dark' ? 1 : 0.94,
    6.2,
    theme === 'dark' ? 0.90 : 0.72,
    7.0,
    theme === 'dark' ? 0.49 : 0.34,
    7.8,
    0,
  ];
}

function fieldColorExpression(domain: number, valueScale: number): unknown[] {
  const scaledDomain = domain * valueScale;
  return [
    'interpolate',
    ['linear'],
    ['elevation'],
    -10000,
    'rgba(0, 0, 0, 0)',
    -9999,
    'rgba(0, 0, 0, 0)',
    -scaledDomain,
    'rgba(188, 67, 17, 0.96)',
    -scaledDomain * 0.5,
    'rgba(247, 176, 86, 0.82)',
    0,
    'rgba(255, 255, 255, 0.56)',
    scaledDomain * 0.5,
    'rgba(160, 207, 232, 1)',
    scaledDomain,
    'rgba(28, 118, 198, 1)',
  ];
}

function metricColorExpression(domain: number): unknown[] {
  return [
    'case',
    ['boolean', ['feature-state', 'publishable'], false],
    [
      'interpolate',
      ['linear'],
      ['to-number', ['feature-state', 'metric'], 0],
      -domain,
      '#bc4311',
      -domain * 0.5,
      '#f7b056',
      0,
      '#ffffff',
      domain * 0.5,
      '#a0cfe8',
      domain,
      '#08518b',
    ],
    '#87949e',
  ];
}

function centroidColorExpression(domain: number): unknown[] {
  return [
    'case',
    ['boolean', ['get', 'publishable'], false],
    [
      'interpolate',
      ['linear'],
      ['to-number', ['get', 'metric'], 0],
      -domain,
      '#bc4311',
      -domain * 0.5,
      '#f7b056',
      0,
      '#ffffff',
      domain * 0.5,
      '#a0cfe8',
      domain,
      '#08518b',
    ],
    '#87949e',
  ];
}

function geometryOpacityExpression(
  unpublishedOpacity: number,
  stops: Array<[number, number]>,
): unknown[] {
  const expression: unknown[] = ['interpolate', ['linear'], ['zoom']];
  for (const [zoom, zoomOpacity] of stops) {
    expression.push(
      zoom,
      [
        '*',
        ['case', ['boolean', ['feature-state', 'active'], false], 1, 0],
        [
          'case',
          ['boolean', ['feature-state', 'publishable'], false],
          1,
          unpublishedOpacity,
        ],
        zoomOpacity,
      ],
    );
  }
  return expression;
}

export class DroughtMap {
  readonly map: MapLibreMap;
  private readonly callbacks: MapCallbacks;
  private readonly geometryPmtilesUrl: string;
  private readonly fieldIndex: DroughtFieldIndex;
  private readonly resolveFieldTileTemplate: (surface: DroughtFieldSurface) => string;
  private renderOptions: RenderOptions | null = null;
  private currentTheme: ThemeMode;
  private labelLayerId: string | undefined;
  private fieldLayerKey: string | null = null;
  private featureLookup = new Map<string, WindowFeature>();
  private featureLookupPayload: WindowPayload | null = null;
  private centroidDataKey: string | null = null;
  private geometryStateKey: string | null = null;
  private syncedGeometryStates = new Set<string>();
  private geometryStateSyncFrame: number | null = null;
  private currentDomain = 2.5;
  private interactionsBound = false;
  private basinLookup = new Map<string, BasinFeature>();
  private basinDataKey: string | null = null;
  private restoreStyleOnIdle = false;

  constructor(
    container: HTMLElement,
    theme: ThemeMode,
    geometryPmtilesUrl: string,
    fieldIndex: DroughtFieldIndex,
    resolveFieldTileTemplate: (surface: DroughtFieldSurface) => string,
    callbacks: MapCallbacks,
  ) {
    this.callbacks = callbacks;
    this.geometryPmtilesUrl = geometryPmtilesUrl;
    this.fieldIndex = fieldIndex;
    this.resolveFieldTileTemplate = resolveFieldTileTemplate;
    this.currentTheme = theme;
    this.map = new MapLibreMap({
      container,
      style: basemapStyle(theme),
      center: [8.610061747885998, 47.404812381681026],
      zoom: 4.1,
      minZoom: 2.8,
      maxZoom: 13,
      maxBounds: [[-32, 30], [52, 75]],
      attributionControl: false,
      antialias: true,
    });

    this.map.addControl(new NavigationControl({showCompass: false}), 'top-right');
    this.map.addControl(new AttributionControl({compact: true}), 'bottom-right');

    this.map.on('style.load', () => {
      this.configureBasemapStack();
      this.ensurePortalLayers();
      // style.load precedes full style readiness on some basemaps. The
      // initial render may be deferred; the next idle restores all layers.
      if (this.renderOptions) {
        this.restoreStyleOnIdle = true;
        this.render(this.renderOptions);
      }
    });
    this.map.on('idle', () => {
      if (!this.restoreStyleOnIdle || !this.map.isStyleLoaded()) return;
      this.restoreStyleOnIdle = false;
      if (this.renderOptions) this.render(this.renderOptions);
    });

    this.map.on('zoom', () => {
      this.callbacks.onZoom(this.map.getZoom());
    });

    this.map.on('moveend', () => this.scheduleGeometryFeatureStateSync());
    this.map.on('sourcedata', (event) => {
      if (event.sourceId === GEOMETRY_SOURCE_ID) {
        this.scheduleGeometryFeatureStateSync();
      }
    });
  }

  setTheme(theme: ThemeMode): void {
    this.currentTheme = theme;
    this.fieldLayerKey = null;
    this.centroidDataKey = null;
    this.geometryStateKey = null;
    this.syncedGeometryStates.clear();
    this.basinDataKey = null;
    this.restoreStyleOnIdle = true;
    this.map.setStyle(basemapStyle(theme));
  }

  render(options: RenderOptions): void {
    this.renderOptions = options;
    if (!this.map.isStyleLoaded()) {
      this.restoreStyleOnIdle = true;
      return;
    }

    this.ensurePortalLayers();
    const allFeatures = options.payload.features;
    this.updateBasinLayer(options);
    const displayFeatures = allFeatures.filter((feature) =>
      matchesFilter(feature, options.featureFilter),
    );
    const publishableFeatures = displayFeatures.filter(
      (feature) => feature.publishable && metricValue(feature, options.metricMode) !== null,
    );
    this.currentDomain = metricDomain(publishableFeatures, options.metricMode);

    if (this.featureLookupPayload !== options.payload) {
      this.featureLookup = new Map(
        allFeatures.map((feature) => [
          featureKey(feature.feature_type, feature.feature_id),
          feature,
        ]),
      );
      this.featureLookupPayload = options.payload;
    }

    const dataKey = `${options.payload.window_id}:${options.metricMode}:${options.payload.tile_signature ?? ''}`;
    const surface = this.fieldSurface(
      options.payload.window_id,
      options.metricMode,
      options.featureFilter,
    );
    if (surface && options.spatialMode === 'individual') {
      this.currentDomain = surface.domain;
      this.updateFieldLayer(surface);
    } else {
      this.hideFieldLayer();
    }

    if (this.centroidDataKey !== dataKey) {
      this.updateCentroidData(allFeatures, options.metricMode);
      this.centroidDataKey = dataKey;
    }
    this.updateCentroidStyles();
    this.updateGeometryStyles(options.featureFilter);
    if (options.spatialMode === 'subbasins') {
      for (const layerId of [
        LAKE_FILL_LAYER_ID, LAKE_LINE_LAYER_ID, REACH_LINE_LAYER_ID,
        LAKE_CENTROID_LAYER_ID, REACH_CENTROID_LAYER_ID,
      ]) {
        if (this.map.getLayer(layerId)) {
          this.map.setLayoutProperty(layerId, 'visibility', 'none');
        }
      }
    }

    if (this.geometryStateKey !== dataKey) {
      const previousWindowId = this.geometryStateKey?.split(':', 1)[0] ?? null;
      if (previousWindowId !== options.payload.window_id) {
        this.clearGeometryFeatureState();
      }
      this.geometryStateKey = dataKey;
      this.syncedGeometryStates.clear();
    }
    this.scheduleGeometryFeatureStateSync();
  }

  private updateBasinLayer(options: RenderOptions): void {
    const source = this.map.getSource(BASIN_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;
    const hasData = options.spatialMode === 'subbasins'
      && options.basinGeometry !== null && options.basinWindow !== null;
    for (const layerId of [BASIN_FILL_ID, BASIN_LINE_ID]) {
      if (this.map.getLayer(layerId)) {
        this.map.setLayoutProperty(layerId, 'visibility', hasData ? 'visible' : 'none');
      }
    }
    if (!hasData || !options.basinGeometry || !options.basinWindow) return;
    const dataKey = `${options.payload.window_id}:${options.featureFilter}`;
    if (this.basinDataKey === dataKey) return;
    this.basinLookup = new Map(
      options.basinWindow.basins.filter((item) => item.feature_type === options.featureFilter)
        .map((item) => [item.basin_id, item]),
    );
    const polygons = {
      type: 'FeatureCollection' as const,
      features: options.basinGeometry.features.map((feature) => {
        const value = this.basinLookup.get(String(feature.properties.basin_id));
        return {
          ...feature,
          properties: {
            ...feature.properties,
            relative_index: value?.relative_index ?? 0,
            supported: Boolean(value),
          },
        };
      }),
    };
    source.setData(polygons as unknown as Parameters<GeoJSONSource['setData']>[0]);
    this.basinDataKey = dataKey;
  }

  private configureBasemapStack(): void {
    const style = this.map.getStyle();
    this.labelLayerId = style.layers?.find((layer) => layer.type === 'symbol')?.id;
    if (!this.map.getSource('carto') || this.map.getLayer(OCEAN_MASK_LAYER_ID)) return;

    this.map.addLayer(
      {
        id: OCEAN_MASK_LAYER_ID,
        type: 'fill',
        source: 'carto',
        'source-layer': 'water',
        filter: ['==', 'class', 'ocean'],
        paint: {
          'fill-color': this.currentTheme === 'dark' ? '#2C353C' : '#d4dadc',
          'fill-opacity': 1,
        },
      },
      this.labelLayerId,
    );
  }

  private ensurePortalLayers(): void {
    if (!this.map.getSource(BASIN_SOURCE_ID)) {
      this.map.addSource(BASIN_SOURCE_ID, {
        type: 'geojson',
        data: {type: 'FeatureCollection', features: []},
      });
    }
    if (!this.map.getLayer(BASIN_FILL_ID)) {
      this.map.addLayer({
        id: BASIN_FILL_ID,
        type: 'fill',
        source: BASIN_SOURCE_ID,
        layout: {visibility: 'none'},
        paint: {
          'fill-color': [
            'case', ['get', 'supported'],
            ['interpolate', ['linear'], ['get', 'relative_index'],
              -2.5, '#bc4311', -1.25, '#f7b056', 0, '#ffffff',
              1.25, '#a0cfe8', 2.5, '#08518b'],
            '#87949e',
          ] as never,
          'fill-opacity': 0.83,
        },
      }, this.labelLayerId);
    }
    if (!this.map.getLayer(BASIN_LINE_ID)) {
      this.map.addLayer({
        id: BASIN_LINE_ID,
        type: 'line',
        source: BASIN_SOURCE_ID,
        layout: {visibility: 'none'},
        paint: {
          'line-color': this.currentTheme === 'dark' ? '#d1d9de' : '#586871',
          'line-opacity': 0.56,
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.25, 8, 0.95] as never,
        },
      }, this.labelLayerId);
    }

    if (!this.map.getSource(CENTROID_SOURCE_ID)) {
      this.map.addSource(CENTROID_SOURCE_ID, {
        type: 'geojson',
        data: {type: 'FeatureCollection', features: []},
        maxzoom: 10,
      });
    }

    if (!this.map.getSource(GEOMETRY_SOURCE_ID)) {
      this.map.addSource(GEOMETRY_SOURCE_ID, {
        type: 'vector',
        url: `pmtiles://${this.geometryPmtilesUrl}`,
        promoteId: {
          lakes: 'feature_id',
          reaches: 'feature_id',
        },
      });
    }

    if (!this.map.getLayer(LAKE_FILL_LAYER_ID)) {
      this.map.addLayer(
        {
          id: LAKE_FILL_LAYER_ID,
          type: 'fill',
          source: GEOMETRY_SOURCE_ID,
          'source-layer': 'lakes',
          minzoom: 5.8,
          paint: {
            'fill-color': metricColorExpression(this.currentDomain) as never,
            'fill-opacity': geometryOpacityExpression(
              0.28,
              [[5.8, 0], [6.6, 0.12], [7.5, 0.62], [8.5, 0.88]],
            ) as never,
          },
        },
        this.labelLayerId,
      );
    }

    if (!this.map.getLayer(LAKE_LINE_LAYER_ID)) {
      this.map.addLayer(
        {
          id: LAKE_LINE_LAYER_ID,
          type: 'line',
          source: GEOMETRY_SOURCE_ID,
          'source-layer': 'lakes',
          minzoom: 6.0,
          paint: {
            'line-color': metricColorExpression(this.currentDomain) as never,
            'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.7, 9, 1.4, 12, 2.0] as never,
            'line-opacity': geometryOpacityExpression(
              0.45,
              [[6, 0], [6.8, 0.4], [7.8, 1]],
            ) as never,
          },
        },
        this.labelLayerId,
      );
    }

    if (!this.map.getLayer(REACH_LINE_LAYER_ID)) {
      this.map.addLayer(
        {
          id: REACH_LINE_LAYER_ID,
          type: 'line',
          source: GEOMETRY_SOURCE_ID,
          'source-layer': 'reaches',
          minzoom: 5.8,
          paint: {
            'line-color': metricColorExpression(this.currentDomain) as never,
            'line-width': ['interpolate', ['linear'], ['zoom'], 5.8, 0.8, 7.5, 2.2, 10, 4.0] as never,
            'line-opacity': geometryOpacityExpression(
              0.4,
              [[5.8, 0], [6.6, 0.22], [7.6, 0.9]],
            ) as never,
          },
        },
        this.labelLayerId,
      );
    }

    const centroidBasePaint = {
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1,
      'circle-opacity': [
        'interpolate',
        ['linear'],
        ['zoom'],
        5.2,
        0,
        6.0,
        0.92,
        7.1,
        0.80,
        8.3,
        0.85,
      ],
      'circle-stroke-opacity': [
        'interpolate',
        ['linear'],
        ['zoom'],
        5.2,
        0,
        6.0,
        0.88,
        7.1,
        0.65,
        8.3,
        0.65,
      ],
    } as const;

    if (!this.map.getLayer(LAKE_CENTROID_LAYER_ID)) {
      this.map.addLayer(
        {
          id: LAKE_CENTROID_LAYER_ID,
          type: 'circle',
          source: CENTROID_SOURCE_ID,
          minzoom: 5.2,
          filter: ['==', ['get', 'feature_type'], 'lake'],
          paint: {
            ...centroidBasePaint,
            'circle-color': centroidColorExpression(this.currentDomain) as never,
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 5.2, 2.5, 7, 4.5, 8.3, 3] as never,
          },
        },
        this.labelLayerId,
      );
    }

    if (!this.map.getLayer(REACH_CENTROID_LAYER_ID)) {
      this.map.addLayer(
        {
          id: REACH_CENTROID_LAYER_ID,
          type: 'circle',
          source: CENTROID_SOURCE_ID,
          minzoom: 5.2,
          filter: ['==', ['get', 'feature_type'], 'reach'],
          paint: {
            ...centroidBasePaint,
            'circle-color': centroidColorExpression(this.currentDomain) as never,
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 5.2, 2.2, 7, 3.8, 8.3, 2.8] as never,
          },
        },
        this.labelLayerId,
      );
    }

    if (!this.interactionsBound) this.bindInteractions();
  }

  private fieldSurface(
    windowId: string,
    metricMode: MetricMode,
    featureFilter: FeatureFilter,
  ): DroughtFieldSurface | null {
    return this.fieldIndex.surfaces.find(
      (surface) =>
        surface.window_id === windowId
        && surface.metric_mode === metricMode
        && surface.feature_filter === featureFilter,
    ) ?? null;
  }

  private updateFieldLayer(surface: DroughtFieldSurface): void {
    const fieldKey = `${surface.window_id}:${surface.metric_mode}:${surface.feature_filter}`;
    const tileTemplate = this.resolveFieldTileTemplate(surface);
    const source = this.map.getSource(FIELD_SOURCE_ID) as RasterDEMTileSource | undefined;

    if (!source) {
      this.map.addSource(FIELD_SOURCE_ID, {
        type: 'raster-dem',
        tiles: [tileTemplate],
        tileSize: this.fieldIndex.tile_size,
        minzoom: this.fieldIndex.minzoom,
        maxzoom: this.fieldIndex.maxzoom,
        bounds: this.fieldIndex.bounds,
        encoding: this.fieldIndex.encoding,
      });
    } else if (this.fieldLayerKey !== fieldKey) {
      source.setTiles([tileTemplate]);
    }

    const colorExpression = fieldColorExpression(
      surface.domain,
      this.fieldIndex.value_scale,
    ) as never;
    if (!this.map.getLayer(FIELD_LAYER_ID)) {
      const beforeId = this.map.getLayer(OCEAN_MASK_LAYER_ID)
        ? OCEAN_MASK_LAYER_ID
        : this.labelLayerId;
      this.map.addLayer(
        {
          id: FIELD_LAYER_ID,
          type: 'color-relief',
          source: FIELD_SOURCE_ID,
          minzoom: 2.8,
          maxzoom: 7.8,
          paint: {
            'color-relief-color': colorExpression,
            'color-relief-opacity': fieldOpacityExpression(this.currentTheme) as never,
            'resampling': 'linear',
          },
        },
        beforeId,
      );
    } else {
      this.map.setLayoutProperty(FIELD_LAYER_ID, 'visibility', 'visible');
      this.map.setPaintProperty(FIELD_LAYER_ID, 'color-relief-color', colorExpression);
      this.map.setPaintProperty(FIELD_LAYER_ID, 'color-relief-opacity',
        fieldOpacityExpression(this.currentTheme) as never);
    }
    this.fieldLayerKey = fieldKey;
  }

  private hideFieldLayer(): void {
    if (this.map.getLayer(FIELD_LAYER_ID)) {
      this.map.setLayoutProperty(FIELD_LAYER_ID, 'visibility', 'none');
    }
    this.fieldLayerKey = null;
  }

  private updateCentroidData(features: WindowFeature[], metricMode: MetricMode): void {
    const source = this.map.getSource(CENTROID_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;
    source.setData({
      type: 'FeatureCollection',
      features: features.map((feature) => ({
        type: 'Feature',
        properties: {
          feature_type: feature.feature_type,
          feature_id: feature.feature_id,
          name: feature.name,
          metric: metricValue(feature, metricMode),
          publishable: feature.publishable,
        },
        geometry: {
          type: 'Point',
          coordinates: [feature.lon, feature.lat],
        },
      })),
    });

  }

  private updateCentroidStyles(): void {
    const colorExpression = centroidColorExpression(this.currentDomain) as never;
    if (this.map.getLayer(LAKE_CENTROID_LAYER_ID)) {
      this.map.setPaintProperty(LAKE_CENTROID_LAYER_ID, 'circle-color', colorExpression);
    }
    if (this.map.getLayer(REACH_CENTROID_LAYER_ID)) {
      this.map.setPaintProperty(REACH_CENTROID_LAYER_ID, 'circle-color', colorExpression);
    }
  }

  private updateGeometryStyles(featureFilter: FeatureFilter): void {
    const colorExpression = metricColorExpression(this.currentDomain) as never;
    if (this.map.getLayer(LAKE_FILL_LAYER_ID)) {
      this.map.setPaintProperty(LAKE_FILL_LAYER_ID, 'fill-color', colorExpression);
    }
    if (this.map.getLayer(LAKE_LINE_LAYER_ID)) {
      this.map.setPaintProperty(LAKE_LINE_LAYER_ID, 'line-color', colorExpression);
    }
    if (this.map.getLayer(REACH_LINE_LAYER_ID)) {
      this.map.setPaintProperty(REACH_LINE_LAYER_ID, 'line-color', colorExpression);
    }

    const lakeVisibility = featureFilter === 'reach' ? 'none' : 'visible';
    const reachVisibility = featureFilter === 'lake' ? 'none' : 'visible';
    for (const layerId of [LAKE_FILL_LAYER_ID, LAKE_LINE_LAYER_ID, LAKE_CENTROID_LAYER_ID]) {
      if (this.map.getLayer(layerId)) {
        this.map.setLayoutProperty(layerId, 'visibility', lakeVisibility);
      }
    }
    for (const layerId of [REACH_LINE_LAYER_ID, REACH_CENTROID_LAYER_ID]) {
      if (this.map.getLayer(layerId)) {
        this.map.setLayoutProperty(layerId, 'visibility', reachVisibility);
      }
    }
  }

  private clearGeometryFeatureState(): void {
    if (!this.map.getSource(GEOMETRY_SOURCE_ID)) return;
    for (const sourceLayer of GEOMETRY_SOURCE_LAYERS) {
      this.map.removeFeatureState({source: GEOMETRY_SOURCE_ID, sourceLayer});
    }
  }

  private scheduleGeometryFeatureStateSync(): void {
    if (this.geometryStateSyncFrame !== null) return;
    this.geometryStateSyncFrame = window.requestAnimationFrame(() => {
      this.geometryStateSyncFrame = null;
      this.syncGeometryFeatureState();
    });
  }

  private syncGeometryFeatureState(): void {
    if (!this.map.getSource(GEOMETRY_SOURCE_ID) || this.featureLookup.size === 0) return;
    this.syncSourceLayerState('lakes', 'lake');
    this.syncSourceLayerState('reaches', 'reach');
  }

  private syncSourceLayerState(sourceLayer: string, featureType: 'lake' | 'reach'): void {
    let sourceFeatures;
    try {
      sourceFeatures = this.map.querySourceFeatures(GEOMETRY_SOURCE_ID, {sourceLayer});
    } catch {
      return;
    }
    const updatedIds = new Set<string>();
    for (const mapFeature of sourceFeatures) {
      const featureId = String(mapFeature.properties?.feature_id ?? '');
      const stateKey = `${sourceLayer}:${featureId}`;
      if (
        !featureId
        || updatedIds.has(featureId)
        || this.syncedGeometryStates.has(stateKey)
      ) {
        continue;
      }
      const feature = this.featureLookup.get(featureKey(featureType, featureId));
      if (!feature) continue;
      const metric = this.renderOptions ? metricValue(feature, this.renderOptions.metricMode) : null;
      this.map.setFeatureState(
        {
          source: GEOMETRY_SOURCE_ID,
          sourceLayer,
          id: mapFeature.id ?? featureId,
        },
        {
          active: true,
          metric: metric ?? 0,
          publishable: feature.publishable && metric !== null,
        },
      );
      updatedIds.add(featureId);
      this.syncedGeometryStates.add(stateKey);
    }
  }

  private bindInteractions(): void {
    this.interactionsBound = true;
    this.map.on('mousemove', BASIN_FILL_ID, (event) => {
      const id = String(event.features?.[0]?.properties?.basin_id ?? '');
      const basin = this.basinLookup.get(id) ?? null;
      this.map.getCanvas().style.cursor = basin ? 'pointer' : '';
      this.callbacks.onBasinHover(basin, event.point.x, event.point.y);
    });
    this.map.on('mouseleave', BASIN_FILL_ID, () => {
      this.map.getCanvas().style.cursor = '';
      this.callbacks.onBasinHover(null, 0, 0);
    });
    this.map.on('click', BASIN_FILL_ID, (event) => {
      const id = String(event.features?.[0]?.properties?.basin_id ?? '');
      const basin = this.basinLookup.get(id);
      if (basin) this.callbacks.onBasinClick(basin);
    });
    const interactiveLayers = [
      LAKE_CENTROID_LAYER_ID,
      REACH_CENTROID_LAYER_ID,
      LAKE_FILL_LAYER_ID,
      LAKE_LINE_LAYER_ID,
      REACH_LINE_LAYER_ID,
    ];

    for (const layerId of interactiveLayers) {
      this.map.on('mousemove', layerId, (event) => {
        const mapFeature = event.features?.[0];
        const feature = mapFeature ? this.windowFeatureForMapFeature(mapFeature) : null;
        this.map.getCanvas().style.cursor = feature ? 'pointer' : '';
        this.callbacks.onFeatureHover(feature, event.point.x, event.point.y);
      });
      this.map.on('mouseleave', layerId, () => {
        this.map.getCanvas().style.cursor = '';
        this.callbacks.onFeatureHover(null, 0, 0);
      });
      this.map.on('click', layerId, (event) => {
        const mapFeature = event.features?.[0];
        const feature = mapFeature ? this.windowFeatureForMapFeature(mapFeature) : null;
        if (feature) this.callbacks.onFeatureClick(feature);
      });
    }
  }

  private windowFeatureForMapFeature(mapFeature: {properties?: Record<string, unknown>}): WindowFeature | null {
    const featureId = String(mapFeature.properties?.feature_id ?? '');
    const featureType = String(mapFeature.properties?.feature_type ?? '');
    if (!featureId || (featureType !== 'lake' && featureType !== 'reach')) return null;
    return this.featureLookup.get(featureKey(featureType, featureId)) ?? null;
  }
}
