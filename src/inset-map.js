import {geoMercator, geoPath} from 'd3-geo';
import {feature as topojsonFeature} from 'topojson-client';
import countriesTopology from 'world-atlas/countries-110m.json';

const EUROPE_BOUNDS = {
  west: -25,
  south: 30,
  east: 39,
  north: 71,
};

const DEFAULT_OPTIONS = {
  width: 232,
  height: 232,
  padding: 4,
};


function svgElement(name, attributes = {}) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}

function themeColors() {
  const style = getComputedStyle(document.documentElement);
  const value = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  return {
    ocean: value('--inset-ocean', '#eef3f5'),
    land: value('--inset-land', '#9caab2'),
    countries: value('--inset-country-border', '#ffffff'),
    accent: value('--inset-viewport', '#f28e2b'),
  };
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function createProjector(options) {
  // A square frame matches the projected shape of the Europe study extent.
  // Keep the whole fixed extent visible while avoiding horizontal letterboxing.
  const unit = geoMercator().scale(1).translate([0, 0]);
  const [left, top] = unit([EUROPE_BOUNDS.west, EUROPE_BOUNDS.north]);
  const [right, bottom] = unit([EUROPE_BOUNDS.east, EUROPE_BOUNDS.south]);
  const scale = Math.min(
    (options.width - 2 * options.padding) / (right - left),
    (options.height - 2 * options.padding) / (bottom - top),
  );
  const projection = geoMercator()
    .scale(scale)
    .translate([
      (options.width - (right - left) * scale) / 2 - left * scale,
      (options.height - (bottom - top) * scale) / 2 - top * scale,
    ])
    .clipExtent([[0, 0], [options.width, options.height]]);
  return {projectPoint: (coordinates) => projection(coordinates), path: geoPath(projection)};
}

function viewportPath(projectPoint, bounds) {
  const west = clamp(bounds.getWest(), EUROPE_BOUNDS.west, EUROPE_BOUNDS.east);
  const east = clamp(bounds.getEast(), EUROPE_BOUNDS.west, EUROPE_BOUNDS.east);
  const south = clamp(bounds.getSouth(), EUROPE_BOUNDS.south, EUROPE_BOUNDS.north);
  const north = clamp(bounds.getNorth(), EUROPE_BOUNDS.south, EUROPE_BOUNDS.north);
  if (west >= east || south >= north) return '';

  const topLeft = projectPoint([west, north]);
  const bottomRight = projectPoint([east, south]);
  if (!topLeft || !bottomRight) return '';
  const width = bottomRight[0] - topLeft[0];
  const height = bottomRight[1] - topLeft[1];
  return `M ${topLeft[0].toFixed(1)} ${topLeft[1].toFixed(1)} `
    + `h ${width.toFixed(1)} v ${height.toFixed(1)} `
    + `h ${(-width).toFixed(1)} Z`;
}

export async function createEuropeInset(container, map) {
  const options = DEFAULT_OPTIONS;
  const {projectPoint, path} = createProjector(options);
  const countriesFeatureCollection = topojsonFeature(
    countriesTopology,
    countriesTopology.objects.countries,
  );
  // Do not filter the world geometry to the bbox: the filtered version
  // artificially removed neighbouring countries from the locator.
  const countries = countriesFeatureCollection;


  const svg = svgElement('svg', {
    class: 'global-inset-svg',
    viewBox: `0 0 ${options.width} ${options.height}`,
    preserveAspectRatio: 'xMidYMid meet',
    'aria-hidden': 'true',
  });
  const defs = svgElement('defs');
  const clipPath = svgElement('clipPath', {id: 'europe-inset-clip'});
  clipPath.append(svgElement('rect', {
    x: 0,
    y: 0,
    width: options.width,
    height: options.height,
    rx: 12,
    ry: 12,
  }));
  defs.append(clipPath);

  const clipped = svgElement('g', {'clip-path': 'url(#europe-inset-clip)'});
  const landPath = svgElement('path', {class: 'global-inset-land'});
  const viewport = svgElement('path', {class: 'global-inset-viewport'});
  clipped.append(landPath, viewport);
  svg.append(defs, clipped);
  container.replaceChildren(svg);

  landPath.setAttribute('d', path(countries) || '');

  function renderTheme() {
    const colors = themeColors();
    container.style.background = colors.ocean;
    landPath.setAttribute('fill', colors.land);
    landPath.setAttribute('stroke', colors.countries);
    viewport.style.stroke = colors.accent;
    viewport.style.fill = colors.accent;
  }

  function renderViewport() {
    viewport.setAttribute('d', viewportPath(projectPoint, map.getBounds()));
    viewport.style.strokeWidth = map.getZoom() >= 8 ? '3px' : '2.2px';
    viewport.style.fillOpacity = map.getZoom() >= 8 ? '0' : '0.10';
  }

  renderTheme();
  renderViewport();

  const update = () => renderViewport();
  map.on('move', update);
  map.on('zoom', update);

  return {
    renderTheme,
    remove() {
      map.off('move', update);
      map.off('zoom', update);
      container.replaceChildren();
    },
  };
}
