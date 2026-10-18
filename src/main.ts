import 'maplibre-gl/dist/maplibre-gl.css';
import {
  addProtocol,
  setWorkerUrl,
} from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import {Protocol} from 'pmtiles';
import './styles.css';

import {
  fieldTileTemplate,
  loadBasinGeometry,
  loadBasinTimeseries,
  loadBasinWindow,
  geometryPmtilesUrl,
  loadFeatureTimeseries,
  loadFieldIndex,
  loadManifest,
  loadWindow,
  loadVisibleWindow,
  registerGeometrySource,
} from './data';
import {createEuropeInset, type EuropeInset} from './inset-map.js';
import {DroughtMap} from './map';
import {mountIntroOverlay} from './intro';
import {initialMapWindowId} from './periods';
import type {
  BasinFeature,
  FeatureFilter,
  MetricMode,
  PortalState,
  SpatialMode,
  ThemeMode,
  WindowFeature,
} from './types';
import {PortalUi} from './ui';

setWorkerUrl(maplibreWorkerUrl);
const pmtilesProtocol = new Protocol();
addProtocol('pmtiles', pmtilesProtocol.tile);

const appElement = document.querySelector<HTMLElement>('#app');
if (!appElement) throw new Error('App root not found.');

const savedTheme = localStorage.getItem('swot-drought-theme');
const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
const initialTheme: ThemeMode = savedTheme === 'dark' || (!savedTheme && prefersDark)
  ? 'dark'
  : 'light';

document.documentElement.dataset.theme = initialTheme;
document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute(
  'content',
  initialTheme === 'dark' ? '#0c141a' : '#0f4c81',
);

const state: PortalState = {
  manifest: null,
  windowPayload: null,
  windowId: null,
  metricMode: 'relative',
  featureFilter: 'lake',
  spatialMode: 'individual',
  basinGeometry: null,
  basinWindow: null,
  selectedBasin: null,
  selectedBasinTimeseries: null,
  theme: initialTheme,
  selectedFeature: null,
  selectedTimeseries: null,
  zoom: 4.1,
};

let droughtMap: DroughtMap | null = null;
let insetMap: EuropeInset | null = null;

function renderMap(): void {
  if (!droughtMap || !state.windowPayload) return;
  droughtMap.render({
    payload: state.windowPayload,
    metricMode: state.metricMode,
    featureFilter: state.featureFilter,
    spatialMode: state.spatialMode,
    basinGeometry: state.basinGeometry,
    basinWindow: state.basinWindow,
  });
}

let viewportRequest = 0;

async function refreshVisibleData(): Promise<void> {
  const request = ++viewportRequest;
  if (!droughtMap || !state.manifest || !state.windowId
    || state.spatialMode !== 'individual') return;
  const bounds = droughtMap.map.getBounds();
  if (droughtMap.map.getZoom() < 5.2) {
    state.windowPayload = await loadWindow(state.manifest, state.windowId);
    renderMap();
    return;
  }
  const selectedWindow = state.windowId;
  try {
    const payload = await loadVisibleWindow(state.manifest, selectedWindow, {
      west: bounds.getWest(), south: bounds.getSouth(),
      east: bounds.getEast(), north: bounds.getNorth(),
    });
    if (request !== viewportRequest || state.windowId !== selectedWindow
      || state.spatialMode !== 'individual') return;
    state.windowPayload = payload;
    renderMap();
  } catch (error) {
    if (request === viewportRequest) {
      console.error('Visible drought features could not be loaded:', error);
      ui.setError(`Visible feature data could not be loaded: ${String(error)}`);
    }
  }
}

async function selectFeature(feature: WindowFeature): Promise<void> {
  state.selectedFeature = feature;
  state.selectedTimeseries = null;
  ui.updateState(state);
  if (!state.manifest) return;

  const selectedKey = `${feature.feature_type}:${feature.feature_id}`;
  try {
    const timeseries = await loadFeatureTimeseries(state.manifest, feature);
    const currentFeature = state.selectedFeature;
    if (
      currentFeature
      && `${currentFeature.feature_type}:${currentFeature.feature_id}` === selectedKey
    ) {
      state.selectedTimeseries = timeseries;
      ui.updateState(state);
    }
  } catch (error) {
    console.error('Feature time series failed:', error);
    state.selectedTimeseries = {
      name: feature.name,
      baseline_profile: [],
      observations: [],
    };
    ui.updateState(state);
  }
}

let basinRequest = 0;
async function selectBasin(basin: BasinFeature): Promise<void> {
  const request = ++basinRequest;
  state.selectedFeature = null;
  state.selectedBasin = basin;
  state.selectedBasinTimeseries = null;
  ui.updateState(state);
  if (!state.manifest) return;
  try {
    const timeseries = await loadBasinTimeseries(
      state.manifest, basin.basin_id, basin.feature_type,
    );
    if (request === basinRequest && state.selectedBasin?.basin_id === basin.basin_id) {
      state.selectedBasinTimeseries = timeseries;
      ui.updateState(state);
    }
  } catch (error) {
    console.error('Subbasin time series failed:', error);
    if (request === basinRequest) {
      ui.setError('The selected subbasin time series could not be loaded.');
    }
  }
}

async function updateBasinWindow(windowId: string): Promise<void> {
  if (!state.manifest?.basins || state.spatialMode !== 'subbasins') return;
  state.basinWindow = await loadBasinWindow(state.manifest, windowId);
}

const ui = new PortalUi(appElement, {
  onWindowChange: async (windowId: string) => {
    if (!state.manifest) return;
    ui.setLoading(true);
    try {
      state.windowPayload = await loadWindow(state.manifest, windowId);
      state.windowId = windowId;
      await updateBasinWindow(windowId);
      if (state.spatialMode === 'subbasins' && state.selectedBasin) {
        state.selectedBasin = state.basinWindow?.basins.find((item) =>
          item.basin_id === state.selectedBasin?.basin_id
          && item.feature_type === state.featureFilter) ?? null;
      } else {
        state.selectedBasin = null;
        state.selectedBasinTimeseries = null;
      }
      state.selectedFeature = null;
      state.selectedTimeseries = null;
      ui.updateState(state);
      renderMap();
      void refreshVisibleData();
    } finally {
      ui.setLoading(false);
    }
  },
  onMetricChange: (metricMode: MetricMode) => {
    state.metricMode = metricMode;
    ui.updateState(state);
    renderMap();
  },
  onFeatureFilterChange: (featureFilter: FeatureFilter) => {
    const previousBasinId = state.selectedBasin?.basin_id;
    state.featureFilter = featureFilter;
    state.selectedFeature = null;
    state.selectedTimeseries = null;
    state.selectedBasin = null;
    state.selectedBasinTimeseries = null;
    if (state.spatialMode === 'subbasins' && previousBasinId) {
      const next = state.basinWindow?.basins.find((item) =>
        item.basin_id === previousBasinId && item.feature_type === featureFilter);
      if (next) void selectBasin(next);
    }
    ui.updateState(state);
    renderMap();
  },
  onThemeChange: (theme: ThemeMode) => {
    state.theme = theme;
    localStorage.setItem('swot-drought-theme', theme);
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute(
      'content',
      theme === 'dark' ? '#0c141a' : '#0f4c81',
    );
    ui.updateState(state);
    droughtMap?.setTheme(theme);
    insetMap?.renderTheme();
  },
  onCloseFeature: () => {
    state.selectedFeature = null;
    state.selectedTimeseries = null;
    state.selectedBasin = null;
    state.selectedBasinTimeseries = null;
    ++basinRequest;
  },
  onSpatialModeChange: async (mode: SpatialMode) => {
    if (mode === 'subbasins' && !state.manifest?.basins) return;
    state.spatialMode = mode;
    state.selectedFeature = null;
    state.selectedTimeseries = null;
    state.selectedBasin = null;
    state.selectedBasinTimeseries = null;
    ++basinRequest;
    if (mode === 'subbasins' && state.manifest && state.windowId) {
      ui.setLoading(true);
      try {
        state.basinGeometry = await loadBasinGeometry(state.manifest);
        await updateBasinWindow(state.windowId);
      } catch (error) {
        state.spatialMode = 'individual';
        ui.setError(`Subbasin data could not be loaded: ${String(error)}`);
      } finally {
        ui.setLoading(false);
      }
    }
    ui.updateState(state);
    renderMap();
    void refreshVisibleData();
  },
});
ui.updateState(state);

// Mount before network requests so the introduction is visible immediately.
mountIntroOverlay(() => {
  // The live map occupies the viewport during the intro and must be resized
  // when the ordinary header/footer layout returns.
  requestAnimationFrame(() => {
    droughtMap?.map.resize();
    renderMap();
  });
});

async function start(): Promise<void> {
  ui.setLoading(true);
  try {
    state.manifest = await loadManifest();
    state.windowId = initialMapWindowId(state.manifest);
    state.windowPayload = await loadWindow(state.manifest, state.windowId);
    await registerGeometrySource(state.manifest, pmtilesProtocol);
    const fieldIndex = await loadFieldIndex(state.manifest);
    ui.setManifest(state.manifest);
    ui.updateState(state);

    droughtMap = new DroughtMap(
      ui.mapElement,
      state.theme,
      geometryPmtilesUrl(state.manifest),
      fieldIndex,
      fieldTileTemplate,
      {
        onFeatureClick: (feature: WindowFeature) => void selectFeature(feature),
        onBasinClick: (basin: BasinFeature) => void selectBasin(basin),
        onBasinHover: (basin: BasinFeature | null, x: number, y: number) => {
          ui.showBasinTooltip(basin, x, y);
        },
        onFeatureHover: (feature: WindowFeature | null, x: number, y: number) => {
          ui.showTooltip(feature, x, y, state.metricMode);
        },
        onZoom: (zoom: number) => {
          state.zoom = zoom;
        },
      },
    );
    renderMap();
    droughtMap.map.once('load', () => {
      renderMap();
      void refreshVisibleData();
    });
    droughtMap.map.on('moveend', () => void refreshVisibleData());
    insetMap = await createEuropeInset(ui.insetMapElement, droughtMap.map);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ui.setError(
      `Portal data could not be loaded. ${message} Run \`npm run data:sync\` if you are developing locally.`,
    );
  } finally {
    ui.setLoading(false);
  }
}

void start();
