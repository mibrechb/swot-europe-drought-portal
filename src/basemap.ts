import type {StyleSpecification} from 'maplibre-gl';
import type {ThemeMode} from './types';

const LIGHT_STYLE_URL = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
const DARK_STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

export function basemapStyle(theme: ThemeMode): string | StyleSpecification {
  return theme === 'dark' ? DARK_STYLE_URL : LIGHT_STYLE_URL;
}
