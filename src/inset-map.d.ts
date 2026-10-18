import type {Map as MapLibreMap} from 'maplibre-gl';

export interface EuropeInset {
  renderTheme: () => void;
  remove: () => void;
}

export function createEuropeInset(
  container: HTMLElement,
  map: MapLibreMap,
): Promise<EuropeInset>;
