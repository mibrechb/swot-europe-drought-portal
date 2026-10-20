import {faqItems} from './content/faq';
import {mapWindows} from './periods';
import type {
  BasinFeature,
  BasinTimeseries,
  FeatureFilter,
  SpatialMode,
  Manifest,
  MetricMode,
  PortalState,
  ThemeMode,
  TimeseriesFeature,
  WindowFeature,
} from './types';

export interface UiCallbacks {
  onWindowChange: (windowId: string) => void;
  onMetricChange: (metricMode: MetricMode) => void;
  onFeatureFilterChange: (featureFilter: FeatureFilter) => void;
  onThemeChange: (theme: ThemeMode) => void;
  onCloseFeature: () => void;
  onSpatialModeChange: (mode: SpatialMode) => void;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function periodLabel(windowId: string): string {
  const [, period = windowId] = windowId.split('_');
  return period.replace('-', '–');
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}


function formatSigned(value: number | null, digits: number, suffix = ''): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(digits)}${suffix}`;
}

/** Approximate the normal CDF for explaining the empirical normal-score index. */
function normalCdf(value: number): number {
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t)
    + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return (1 + (value < 0 ? -erf : erf)) / 2;
}

/** Percentages represented by the rank-based seasonal normal score. */
function seasonalPercentages(value: number): {lower: number; higher: number} {
  const lower = Math.round(normalCdf(value) * 100);
  return {lower, higher: 100 - lower};
}

/** Describe the seasonal rank without implying a measured WSE standard deviation. */
function seasonalMagnitude(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude < 0.1) return 'close to usual';
  const direction = value < 0 ? 'lower' : 'higher';
  if (magnitude < 0.25) return `slightly ${direction} than usual`;
  if (magnitude < 0.5) return `noticeably ${direction} than usual`;
  if (magnitude < 1) return `considerably ${direction} than usual`;
  if (magnitude < 2) return `much ${direction} than usual`;
  return `exceptionally ${direction} than usual`;
}

function relativeIndexSummary(
  value: number | null,
  subject: string,
  isRegional = false,
): string {
  if (value === null || !Number.isFinite(value)) return '';
  const {lower, higher} = seasonalPercentages(value);
  const condition = seasonalMagnitude(value);
  if (isRegional) {
    return ` ${subject} relative water-level index was ${formatSigned(value, 2)}, indicating conditions ${condition} for this season. On the estimated seasonal reference scale, about ${lower}% of comparable water levels would be lower, and ${higher}% higher.`;
  }
  return ` ${subject} relative water-level index was ${formatSigned(value, 2)}, indicating water levels ${condition} for this season. On the estimated seasonal reference scale, about ${lower}% of comparable water levels would be lower, and ${higher}% higher.`;
}

/** Display the seasonal rank on a standard normal reference curve. */
function scoreGaugeMarkup(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '';
  const width = 300;
  const height = 102;
  const left = 12;
  const right = width - 12;
  const top = 12;
  const bottom = 65;
  const x = (z: number) => left + (Math.max(-3, Math.min(3, z)) + 3) / 6 * (right - left);
  const normal = (z: number) => Math.exp(-0.5 * z * z);
  const curve = Array.from({length: 121}, (_, index) => {
    const z = -3 + index * 0.05;
    return `${index === 0 ? 'M' : 'L'} ${x(z).toFixed(2)} ${(bottom - normal(z) * (bottom - top)).toFixed(2)}`;
  }).join(' ');
  const marker = x(value);
  const markerY = bottom - normal(Math.max(-3, Math.min(3, value))) * (bottom - top);
  const {lower, higher} = seasonalPercentages(value);
  const percentLabelGap = 12;
  const lowerLabelX = marker - percentLabelGap;
  const higherLabelX = marker + percentLabelGap;
  const gradientId = 'seasonal-rank-gradient';
  return `<div class="score-gauge">
    <div class="score-gauge-heading"><span>Relative water-level index</span><strong>${formatSigned(value, 2)}</strong></div>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Relative water-level index ${formatSigned(value, 2)}: about ${lower}% of the seasonal reference distribution is lower and ${higher}% is higher">
      <defs>
        <linearGradient id="${gradientId}" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stop-color="#bc4311" />
          <stop offset="24%" stop-color="#ed9851" />
          <stop offset="50%" stop-color="#f6f8f9" />
          <stop offset="76%" stop-color="#80b8d8" />
          <stop offset="100%" stop-color="#15628f" />
        </linearGradient>
      </defs>
      <path class="score-gauge-fill" fill="url(#${gradientId})" d="M ${left} ${bottom} ${curve.replace(/^M /, 'L ')} L ${right} ${bottom} Z" />
      <path class="score-gauge-curve" d="${curve}" />
      <line class="score-gauge-zero" x1="${x(0)}" x2="${x(0)}" y1="${top}" y2="${bottom}" />
      <line class="score-gauge-marker" x1="${marker}" x2="${marker}" y1="${Math.max(top - 3, markerY - 10)}" y2="${bottom + 2}" />
      <circle class="score-gauge-dot" cx="${marker}" cy="${markerY}" r="4" />
      <text class="score-gauge-percent" x="${lowerLabelX.toFixed(1)}" y="${bottom - 11}" text-anchor="end">${lower}%</text>
      <text class="score-gauge-percent" x="${higherLabelX.toFixed(1)}" y="${bottom - 11}" text-anchor="start">${higher}%</text>
      <text class="score-gauge-tick" x="${x(-2)}" y="${bottom + 13}" text-anchor="middle">−2</text>
      <text class="score-gauge-tick" x="${x(0)}" y="${bottom + 13}" text-anchor="middle">0</text>
      <text class="score-gauge-tick" x="${x(2)}" y="${bottom + 13}" text-anchor="middle">+2</text>
      <text class="score-gauge-scale-label" x="${left}" y="${height - 4}">Lower</text>
      <text class="score-gauge-scale-label" x="${x(0)}" y="${height - 4}" text-anchor="middle">Seasonal baseline</text>
      <text class="score-gauge-scale-label" x="${right}" y="${height - 4}" text-anchor="end">Higher</text>
    </svg>
  </div>`;
}

function basinSummary(basin: BasinFeature, windowId: string | null): string {
  const kind = basin.feature_type === 'lake' ? 'lakes' : 'river reaches';
  const period = windowId ? periodLabel(windowId) : 'the selected period';
  const count = basin.feature_count;
  const change = basin.median_anomaly_m;
  if (typeof change === 'number' && Number.isFinite(change)) {
    const levelDescription = Math.abs(change) < 0.02
      ? `close to their usual seasonal levels (median difference ${formatSigned(change, 2, ' m')})`
      : `${Math.abs(change).toFixed(2)} m ${change < 0 ? 'below' : 'above'} their usual seasonal levels (median difference)`;
    return `For ${period}, water levels across ${count} contributing ${kind} were typically ${levelDescription}.${relativeIndexSummary(basin.relative_index, 'Their median', true)}`;
  }
  if (basin.relative_index !== null && Number.isFinite(basin.relative_index)) {
    return `For ${period}, ${count} ${kind} contributed to the regional estimate.${relativeIndexSummary(basin.relative_index, 'Their median', true)}`;
  }
  return `For ${period}, there are not enough comparable observations for these ${kind}.`;
}

function supportSummary(feature: WindowFeature): string {
  const count = feature.period_n;
  if (count === 0) {
    return 'No qualifying water-level observations were available for this period.';
  }
  const support = feature.support_class === 'standard'
    ? 'Data support is standard.'
    : feature.support_class === 'limited'
      ? 'Data support is limited; interpret this comparison with care.'
      : 'Data support is insufficient for a reliable comparison.';
  const quality = `${feature.period_good_n} ${feature.period_good_n === 1 ? 'observation has' : 'observations have'} a good quality flag; ${feature.period_suspect_n} ${feature.period_suspect_n === 1 ? 'observation is' : 'observations are'} flagged as suspect.`;
  const baseline = `Each comparison uses at least ${feature.baseline_n} observations from the same season in previous years.`;
  return `${support} ${quality} ${baseline}`;
}

function interpretation(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'No supported value';
  if (value < -0.05) return 'Lower than expected';
  if (value > 0.05) return 'Higher than expected';
  return 'Typical seasonal level';
}

function statusClass(value: number | null): string {
  if (value === null || !Number.isFinite(value) || Math.abs(value) <= 0.05) return 'normal';
  return value < 0 ? 'low' : 'high';
}

function interpolateChannel(start: number, end: number, fraction: number): number {
  return Math.round(start + (end - start) * fraction);
}

function seriesPointColor(anomaly: number | null, domain: number): string {
  if (anomaly === null || !Number.isFinite(anomaly)) return '#aab5bc';
  const normalized = Math.min(1, Math.abs(anomaly) / Math.max(domain, 1e-9));
  const neutral = [255, 255, 255];
  const extreme = anomaly < 0 ? [224, 119, 35] : [47, 145, 194];
  const channels = neutral.map((channel, index) =>
    interpolateChannel(channel, extreme[index], normalized),
  );
  return `rgb(${channels.join(' ')})`;
}

function seasonalDayToTime(day: number, year: number): number {
  const reference = new Date(Date.UTC(2025, 0, day));
  return Date.UTC(year, reference.getUTCMonth(), reference.getUTCDate());
}

function selectedPeriodMarkers(
  windowId: string | null,
  year: number,
): {start: number; end: number; startLabel: string; endLabel: string} | null {
  if (!windowId) return null;
  const [, period] = windowId.split('_');
  if (!period) return null;
  const [startLabel, endLabel] = period.split('-');
  if (!startLabel || !endLabel) return null;
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const startMonth = monthNames.indexOf(startLabel);
  const endMonth = monthNames.indexOf(endLabel);
  if (startMonth < 0 || endMonth < 0) return null;
  return {
    start: Date.UTC(year, startMonth, 1),
    end: Date.UTC(year, endMonth + 1, 1) - 1,
    startLabel,
    endLabel,
  };
}

function titleCase(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/(^|[\s\-'/])\p{L}/gu, (match) => match.toLocaleUpperCase());
}

function featureDisplayName(feature: WindowFeature): string {
  const firstName = feature.name?.split(';', 1)[0].trim();
  if (firstName) {
    return firstName === firstName.toLocaleUpperCase()
      ? titleCase(firstName)
      : firstName;
  }
  return `${feature.feature_type === 'lake' ? 'Lake' : 'River reach'} ${feature.feature_id}`;
}

function featureSummary(feature: WindowFeature, windowId: string | null): string {
  const kind = feature.feature_type === 'lake' ? 'lake' : 'river reach';
  const period = windowId ? periodLabel(windowId) : 'the selected period';
  const anomaly = feature.anomaly_m;
  if (anomaly === null || !Number.isFinite(anomaly)) {
    return `For ${period}, there are not enough comparable water-level measurements for this ${kind}.${relativeIndexSummary(feature.relative_index, 'Its')}`;
  }
  const levelDescription = Math.abs(anomaly) < 0.02
    ? `this ${kind}'s water level was close to its usual seasonal level (median difference ${formatSigned(anomaly, 2, ' m')})`
    : `this ${kind}'s median water level was ${Math.abs(anomaly).toFixed(2)} m ${anomaly < 0 ? 'below' : 'above'} its usual level for this time of year (based on previous SWOT observations)`;
  return `For ${period}, ${levelDescription}.${relativeIndexSummary(feature.relative_index, 'Its')}`;
}

function sparklineMarkup(
  timeseries: TimeseriesFeature | null,
  windowId: string | null,
  isBasin = false,
  basinSeries: BasinTimeseries | null = null,
): string {
  if (timeseries === null) {
    return '<div class="series-loading" role="status" aria-live="polite"><span class="series-spinner" aria-hidden="true"></span><span>Loading 2026 observations…</span></div>';
  }

  const sortedObservations = [...timeseries.observations].sort(
    (left, right) => new Date(left.time).getTime() - new Date(right.time).getTime(),
  );
  if (sortedObservations.length === 0 && timeseries.baseline_profile.length === 0) {
    return '<div class="series-loading">No supported temporal series is available for this selection.</div>';
  }

  const windowYear = Number(windowId?.split('_')[0]);
  const targetYear = sortedObservations.length > 0
    ? new Date(sortedObservations[0].time).getUTCFullYear()
    : Number.isFinite(windowYear) ? windowYear : 2026;
  const width = 336;
  const height = 126;
  const paddingX = 8;
  const paddingY = 14;
  const minTime = Date.UTC(targetYear, 0, 1);
  const maxTime = Date.UTC(targetYear + 1, 0, 1) - 1;

  const baselinePoints = timeseries.baseline_profile.length > 0
    ? timeseries.baseline_profile.map(([day, q25, q50, q75]) => ({
        time: seasonalDayToTime(day, targetYear),
        q25,
        q50,
        q75,
      }))
    : sortedObservations.map((observation) => ({
        time: new Date(observation.time).getTime(),
        q25: observation.seasonal_q25_m,
        q50: observation.seasonal_q50_m,
        q75: observation.seasonal_q75_m,
      }));

  const values = [
    ...sortedObservations.map((observation) => observation.wse_m),
    ...baselinePoints.flatMap((point) => [point.q25, point.q50, point.q75]),
    ...(basinSeries?.observations.flatMap((point) => [point.q25 ?? null, point.q75 ?? null]) ?? []),
  ].filter((value): value is number => value !== null && Number.isFinite(value));
  if (values.length === 0) {
    return '<div class="series-loading">No supported values are available for this selection.</div>';
  }

  let minValue = Math.min(...values);
  let maxValue = Math.max(...values);
  const originalRange = maxValue - minValue;
  const margin = originalRange > 0
    ? originalRange * 0.14
    : Math.max(Math.abs(minValue) * 0.001, 0.05);
  minValue -= margin;
  maxValue += margin;

  const x = (time: number) =>
    paddingX + ((time - minTime) / Math.max(1, maxTime - minTime)) * (width - 2 * paddingX);
  const y = (value: number) =>
    paddingY + ((maxValue - value) / Math.max(1e-9, maxValue - minValue)) * (height - 2 * paddingY);

  const comparableHistory = !isBasin || basinSeries === null || basinSeries.schema_version >= 3;
  // Schema 2's grey IQR is across yearly basin medians; schema 3's is the
  // spatial waterbody IQR, matching the current-year band. Never mislabel v2.
  const envelopePoints = comparableHistory ? baselinePoints.filter(
    (point) => point.q25 !== null && point.q75 !== null,
  ) : [];
  const upperEnvelope = envelopePoints.map((point) =>
    `${x(point.time).toFixed(1)} ${y(point.q75 as number).toFixed(1)}`,
  );
  const lowerEnvelope = [...envelopePoints].reverse().map((point) =>
    `${x(point.time).toFixed(1)} ${y(point.q25 as number).toFixed(1)}`,
  );
  const envelopePath = upperEnvelope.length >= 2
    ? `M ${upperEnvelope.join(' L ')} L ${lowerEnvelope.join(' L ')} Z`
    : '';

  const medianPoints = baselinePoints.filter((point) => point.q50 !== null);
  const medianPath = medianPoints
    .map((point, index) =>
      `${index === 0 ? 'M' : 'L'} ${x(point.time).toFixed(1)} ${y(point.q50 as number).toFixed(1)}`,
    )
    .join(' ');
  let previousObservation: typeof sortedObservations[number] | null = null;
  const bridgePaths: string[] = [];
  const maxBridgeDays = 22;
  const observedPath = sortedObservations
    .map((observation, index) => {
      const time = Date.parse(observation.time);
      const previousTime = previousObservation ? Date.parse(previousObservation.time) : null;
      const gapDays = previousTime === null ? 0 : (time - previousTime) / 86400000;
      const startsNewRun = index === 0 || (isBasin && gapDays > 9);
      if (isBasin && previousObservation && gapDays > 9 && gapDays <= maxBridgeDays) {
        bridgePaths.push(`M ${x(previousTime as number).toFixed(1)} ${y(previousObservation.wse_m).toFixed(1)} L ${x(time).toFixed(1)} ${y(observation.wse_m).toFixed(1)}`);
      }
      previousObservation = observation;
      return `${startsNewRun ? 'M' : 'L'} ${x(time).toFixed(1)} ${y(observation.wse_m).toFixed(1)}`;
    })
    .join(' ');
  const currentBandPoints = (basinSeries?.observations ?? [])
    .filter((point) => Number.isFinite(point.q25) && Number.isFinite(point.q75))
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  // Interpolate the visual ribbon across at most two missing weeks. Never
  // synthesize weekly observations, statistics or tooltips.
  const bandRuns: typeof currentBandPoints[] = [];
  for (const point of currentBandPoints) {
    const latest = bandRuns[bandRuns.length - 1];
    if (!latest || Date.parse(point.time) - Date.parse(latest[latest.length - 1].time) > maxBridgeDays * 86400000) {
      bandRuns.push([point]);
    } else {
      latest.push(point);
    }
  }
  const currentBands = bandRuns.filter((run) => run.length >= 2).map((run) => {
    const top = run.map((point) => `${x(Date.parse(point.time)).toFixed(1)} ${y(point.q75 as number).toFixed(1)}`);
    const bottom = [...run].reverse().map((point) => `${x(Date.parse(point.time)).toFixed(1)} ${y(point.q25 as number).toFixed(1)}`);
    return `<path class="series-current-band" d="M ${top.join(' L ')} L ${bottom.join(' L ')} Z" />`;
  }).join('');
  // Only the individual-observation chart shows point markers. A regional
  // series is a weekly summary, so its median line and spatial IQR are enough.

  const anomalyDomain = Math.max(
    0.05,
    ...sortedObservations
      .map((observation) => Math.abs(observation.anomaly_m ?? 0))
      .filter((value) => Number.isFinite(value)),
  );
  const circles = sortedObservations
    .map((observation) => {
      const circleX = x(new Date(observation.time).getTime()).toFixed(1);
      const circleY = y(observation.wse_m).toFixed(1);
      const fill = seriesPointColor(observation.anomaly_m, anomalyDomain);
      const basinObservation = basinSeries?.observations.find((item) => item.time === observation.time);
      const detail = basinObservation
        ? ` · ${basinObservation.feature_count} contributing features${Number.isFinite(basinObservation.q25) && Number.isFinite(basinObservation.q75) ? ` · middle 50%: ${formatSigned(basinObservation.q25 ?? null, 2)} to ${formatSigned(basinObservation.q75 ?? null, 2)}` : ''}`
        : '';
      return `<circle class="series-point" cx="${circleX}" cy="${circleY}" r="3.2" style="fill:${fill}"><title>${escapeHtml(formatDate(observation.time))}: ${formatSigned(observation.anomaly_m, 2, isBasin ? '' : ' m')} ${isBasin ? 'relative index' : 'vs seasonal expectation'}${escapeHtml(detail)}</title></circle>`;
    })
    .join('');

  const selectedPeriod = selectedPeriodMarkers(windowId, targetYear);
  const periodMarkup = selectedPeriod
    ? `
      <line class="series-window-marker" x1="${x(selectedPeriod.start).toFixed(1)}" x2="${x(selectedPeriod.start).toFixed(1)}" y1="${paddingY}" y2="${height - paddingY}" />
      <text class="series-window-label" x="${(x(selectedPeriod.start) + 3).toFixed(1)}" y="10" text-anchor="start">${escapeHtml(selectedPeriod.startLabel)}</text>
      <line class="series-window-marker" x1="${x(selectedPeriod.end).toFixed(1)}" x2="${x(selectedPeriod.end).toFixed(1)}" y1="${paddingY}" y2="${height - paddingY}" />
      <text class="series-window-label" x="${(x(selectedPeriod.end) - 3).toFixed(1)}" y="10" text-anchor="end">${escapeHtml(selectedPeriod.endLabel)}</text>
    `
    : '';

  return `
    <div class="series-heading-row">
      <span>${isBasin ? '2026 regional relative index' : '2026 observed WSE'}</span>
      <span class="series-count">${sortedObservations.length} ${isBasin ? 'weeks' : `observation${sortedObservations.length === 1 ? '' : 's'}`} </span>
    </div>
    <svg class="series-sparkline${isBasin ? ' regional-series' : ''}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${isBasin ? 'Subbasin normalized relative index' : 'Water-surface elevation'} with historical interquartile range">
      ${envelopePath ? `<path class="series-envelope" d="${envelopePath}" />` : ''}
      ${medianPath ? `<path class="series-baseline" d="${medianPath}" />` : ''}
      ${periodMarkup}
      ${currentBands}
      ${observedPath ? `<path class="series-observed${isBasin ? ' series-regional-median' : ''}" d="${observedPath}" />` : ''}
      ${isBasin && bridgePaths.length ? `<path class="series-interpolated" d="${bridgePaths.join(' ')}"><title>Visual interpolation across missing weeks</title></path>` : ''}
      ${isBasin ? '' : circles}
    </svg>
    <div class="series-date-range"><span>Jan</span><span>Dec</span></div>
    ${isBasin ? `<div class="series-key series-key-regional-pairs">
      <div class="series-key-row"><span><i class="series-key-line series-key-regional"></i>Median (2026)</span><span><i class="series-key-current-band"></i><span class="series-key-percentiles">P<sub>25</sub>–P<sub>75</sub></span></span></div>
      ${comparableHistory ? '<div class="series-key-row"><span><i class="series-key-dash"></i>Historical median (2023–2025)</span><span><i class="series-key-band series-key-history"></i><span class="series-key-percentiles">P<sub>25</sub>–P<sub>75</sub></span></span></div>' : ''}
    </div>` : `<div class="series-key">
      <span><i class="series-key-line"></i>2026 water level</span>
      <span><i class="series-key-band"></i><span class="series-key-percentiles">Historical P<sub>25</sub>–P<sub>75</sub></span></span>
      <span><i class="series-key-dash"></i>Historical median</span>
    </div>`}
    ${isBasin ? (comparableHistory ? '' : '<p class="series-note">The historical interval will appear after the regional data are republished.</p>') : ''}
  `;
}

export class PortalUi {
  readonly mapElement: HTMLElement;
  readonly insetMapElement: HTMLElement;
  private readonly appElement: HTMLElement;
  private readonly callbacks: UiCallbacks;
  private readonly sidePanel: HTMLElement;
  private readonly sidePanelBody: HTMLElement;
  private readonly legendElement: HTMLElement;
  private readonly tooltipElement: HTMLElement;
  private readonly errorElement: HTMLElement;
  private readonly periodSlider: HTMLInputElement;
  private readonly periodTicks: HTMLElement;
  private readonly periodCurrent: HTMLElement;
  private readonly faqModal: HTMLDialogElement;
  private windowIds: string[] = [];

  constructor(appElement: HTMLElement, callbacks: UiCallbacks) {
    this.appElement = appElement;
    this.callbacks = callbacks;
    this.appElement.innerHTML = this.template();
    this.mapElement = this.requiredElement('#map');
    this.insetMapElement = this.requiredElement('#inset-map');
    this.sidePanel = this.requiredElement('#feature-panel');
    this.sidePanelBody = this.requiredElement('#feature-panel-body');
    this.legendElement = this.requiredElement('#map-legend');
    this.tooltipElement = this.requiredElement('#map-tooltip');
    this.errorElement = this.requiredElement('#error-banner');
    this.periodSlider = this.requiredElement<HTMLInputElement>('#period-slider');
    this.periodTicks = this.requiredElement('#period-ticks');
    this.periodCurrent = this.requiredElement('#period-current');
    this.faqModal = this.requiredElement<HTMLDialogElement>('#faq-dialog');
    this.bindEvents();
  }

  setManifest(manifest: Manifest): void {
    this.windowIds = mapWindows(manifest).map((window) => window.id);
    const subbasinsButton = this.requiredElement<HTMLButtonElement>('[data-spatial-mode="subbasins"]');
    subbasinsButton.disabled = !manifest.basins;
    subbasinsButton.title = manifest.basins ? 'HydroBASINS Level 5' :
      'Publish HydroBASINS Level 5 data to enable regional mode';
    this.periodSlider.min = '0';
    this.periodSlider.max = String(Math.max(0, this.windowIds.length - 1));
    this.periodSlider.step = '1';
    this.periodTicks.innerHTML = this.windowIds
      .map((windowId, index) => `
        <button type="button" class="period-tick" data-period-index="${index}" aria-label="${escapeHtml(periodLabel(windowId))}">
          <span class="period-dot"></span>
          <span class="period-tick-label">${escapeHtml(periodLabel(windowId))}</span>
        </button>
      `)
      .join('');
    this.periodTicks.querySelectorAll<HTMLButtonElement>('[data-period-index]').forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.periodIndex);
        const windowId = this.windowIds[index];
        if (windowId) this.callbacks.onWindowChange(windowId);
      });
    });
  }

  updateState(state: PortalState): void {
    document.documentElement.dataset.theme = state.theme;
    const periodIndex = state.windowId ? this.windowIds.indexOf(state.windowId) : -1;
    if (periodIndex >= 0) {
      this.periodSlider.value = String(periodIndex);
      this.periodCurrent.textContent = periodLabel(this.windowIds[periodIndex]);
      const denominator = Math.max(1, this.windowIds.length - 1);
      this.periodSlider.style.setProperty('--period-progress', `${(periodIndex / denominator) * 100}%`);
      this.periodTicks.querySelectorAll<HTMLButtonElement>('[data-period-index]').forEach((button) => {
        button.classList.toggle('is-active', Number(button.dataset.periodIndex) === periodIndex);
      });
    }
    document.querySelectorAll<HTMLButtonElement>('[data-spatial-mode]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.spatialMode === state.spatialMode);
    });
    document.querySelectorAll<HTMLButtonElement>('[data-feature-filter]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.featureFilter === state.featureFilter);
    });
    const themeToggle = this.requiredElement<HTMLInputElement>('#theme-toggle');
    themeToggle.checked = state.theme === 'dark';
    const euFundingLogo = this.requiredElement<HTMLImageElement>('#funding-eu-logo');
    const seriFundingLogo = this.requiredElement<HTMLImageElement>('#funding-seri-logo');
    euFundingLogo.src = state.theme === 'dark'
      ? './assets/img/img_eu-funding-dark.png'
      : './assets/img/img_eu-funding-light.png';
    seriFundingLogo.src = state.theme === 'dark'
      ? './assets/img/img_seri-funding-dark.png'
      : './assets/img/img_seri-funding-light.png';
    this.updateLegend(state);
    if (state.selectedBasin) {
      this.updateBasinPanel(state.selectedBasin, state.selectedBasinTimeseries, state.windowId);
    } else {
      this.updateFeaturePanel(state.selectedFeature, state.selectedTimeseries, state.windowId);
    }
  }

  setLoading(isLoading: boolean): void {
    document.body.classList.toggle('is-loading', isLoading);
  }

  setError(message: string): void {
    this.errorElement.textContent = message;
    this.errorElement.classList.toggle('is-visible', Boolean(message));
  }

  showTooltip(feature: WindowFeature | null, x: number, y: number, metricMode: MetricMode): void {
    if (!feature) {
      this.tooltipElement.classList.remove('is-visible');
      return;
    }
    const value = metricMode === 'relative' ? feature.relative_index : feature.anomaly_m;
    const formatted = metricMode === 'relative'
      ? formatSigned(value, 2)
      : formatSigned(value, 2, ' m');
    this.tooltipElement.innerHTML = `
      <strong>${escapeHtml(featureDisplayName(feature))}</strong>
      <span>${escapeHtml(interpretation(value))} · ${formatted}</span>
    `;
    this.tooltipElement.style.transform = `translate(${x + 14}px, ${y + 14}px)`;
    this.tooltipElement.classList.add('is-visible');
  }

  showBasinTooltip(basin: BasinFeature | null, x: number, y: number): void {
    if (!basin) {
      this.tooltipElement.classList.remove('is-visible');
      return;
    }
    this.tooltipElement.innerHTML = `
      <strong>Subbasin ${escapeHtml(basin.basin_id)}</strong>
      <span>${formatSigned(basin.relative_index, 2)} · ${basin.feature_count} ${basin.feature_type === 'lake' ? 'lakes' : 'river reaches'}</span>
    `;
    this.tooltipElement.style.transform = `translate(${x + 14}px, ${y + 14}px)`;
    this.tooltipElement.classList.add('is-visible');
  }

  private updateBasinPanel(
    basin: BasinFeature,
    timeseries: BasinTimeseries | null,
    windowId: string | null,
  ): void {
    const chartSeries: TimeseriesFeature | null = timeseries === null ? null : {
      name: null,
      baseline_profile: timeseries.baseline_profile,
      observations: timeseries.observations.map((item) => ({
        time: item.time,
        wse_m: item.relative_index,
        relative_index: item.relative_index,
        anomaly_m: item.relative_index,
        quality: 0,
        seasonal_baseline_m: null,
        seasonal_q25_m: null,
        seasonal_q50_m: null,
        seasonal_q75_m: null,
      })),
    };
    this.sidePanelBody.innerHTML = `
      <div class="feature-kicker">HydroBASINS Level 5 · ${basin.feature_type === 'lake' ? 'Lakes' : 'Rivers'}</div>
      <h2>Subbasin ${escapeHtml(basin.basin_id)}</h2>
      <div class="plain-status plain-status-${statusClass(basin.relative_index)}">
        ${escapeHtml(interpretation(basin.relative_index))}
      </div>
      <p class="feature-summary">${escapeHtml(basinSummary(basin, windowId))}</p>
      <section class="metric-grid">
        <div><span>Relative anomaly</span><strong>${formatSigned(basin.relative_index, 2)}</strong><small>Median seasonal index (0 = typical)</small></div>
        <div><span>Contributing ${basin.feature_type === 'lake' ? 'lakes' : 'river reaches'}</span><strong>${basin.feature_count}</strong><small>${basin.observation_count} observations in period</small></div>
      </section>
      ${scoreGaugeMarkup(basin.relative_index)}
      <section class="feature-section time-series-section">
        <h3>Regional water-level context</h3>
        ${sparklineMarkup(chartSeries, windowId, true, timeseries)}
      </section>
    `;
    this.sidePanel.classList.add('is-open');
  }

  private updateFeaturePanel(
    feature: WindowFeature | null,
    timeseries: TimeseriesFeature | null,
    windowId: string | null,
  ): void {
    if (!feature) {
      this.sidePanel.classList.remove('is-open');
      return;
    }
    const title = featureDisplayName(feature);
    const primaryValue = feature.relative_index;
    this.sidePanelBody.innerHTML = `
      <div class="feature-kicker">${feature.feature_type === 'lake' ? 'Lake' : 'River reach'} · ${escapeHtml(feature.feature_id)}</div>
      <h2>${escapeHtml(title)}</h2>
      <div class="plain-status plain-status-${statusClass(primaryValue)}">
        ${escapeHtml(interpretation(primaryValue))}
      </div>
      <p class="feature-summary">${escapeHtml(featureSummary(feature, windowId))}</p>

      <section class="metric-grid">
        <div><span>Relative anomaly</span><strong>${formatSigned(feature.relative_index, 2)}</strong><small>Seasonal index (0 = typical)</small></div>
        <div><span>Absolute anomaly</span><strong>${formatSigned(feature.anomaly_m, 2, ' m')}</strong><small>Difference from the usual seasonal water level</small></div>
      </section>
      ${scoreGaugeMarkup(feature.relative_index)}

      <section class="feature-section time-series-section">
        <h3>Water-level context</h3>
        ${sparklineMarkup(timeseries, windowId)}
      </section>

      <section class="feature-section support-section">
        <h3>Data support</h3>
        <div class="support-row"><span>Support</span><strong>${escapeHtml(feature.support_class)}</strong></div>
        <div class="support-row"><span>Period observations</span><strong>${feature.period_n}</strong></div>
        <div class="support-row"><span>Good / suspect</span><strong>${feature.period_good_n} / ${feature.period_suspect_n}</strong></div>
        <div class="support-row"><span>Seasonal baseline</span><strong>${feature.baseline_n} observations · ${feature.baseline_years_n} years</strong></div>
        <div class="support-row"><span>Period coverage</span><strong>${formatDate(feature.period_first_date)} – ${formatDate(feature.period_last_date)}</strong></div>
        <p class="support-summary">${escapeHtml(supportSummary(feature))}</p>
      </section>

    `;
    this.sidePanel.classList.add('is-open');
  }

  private updateLegend(_state: PortalState): void {
    this.legendElement.innerHTML = `
      <div class="legend-title">Water level deviation</div>
      <div class="legend-ramp"></div>
      <div class="legend-labels"><span>Lower</span><span>Typical seasonal level</span><span>Higher</span></div>
      <div class="legend-values"><span>−2.5</span><span>0</span><span>+2.5</span></div>
    `;
  }

  private bindEvents(): void {
    this.periodSlider.addEventListener('change', () => {
      const windowId = this.windowIds[Number(this.periodSlider.value)];
      if (windowId) this.callbacks.onWindowChange(windowId);
    });
    document.querySelectorAll<HTMLButtonElement>('[data-spatial-mode]').forEach((button) => {
      button.addEventListener('click', () =>
        this.callbacks.onSpatialModeChange(button.dataset.spatialMode as SpatialMode));
    });
    document.querySelectorAll<HTMLButtonElement>('[data-feature-filter]').forEach((button) => {
      button.addEventListener('click', () => this.callbacks.onFeatureFilterChange(button.dataset.featureFilter as FeatureFilter));
    });
    const themeToggle = this.requiredElement<HTMLInputElement>('#theme-toggle');
    themeToggle.addEventListener('change', () => this.callbacks.onThemeChange(themeToggle.checked ? 'dark' : 'light'));
    this.requiredElement('#feature-close').addEventListener('click', () => {
      this.sidePanel.classList.remove('is-open');
      this.callbacks.onCloseFeature();
    });
    this.requiredElement('#faq-button').addEventListener('click', () => this.faqModal.showModal());
    this.requiredElement('#faq-close').addEventListener('click', () => this.faqModal.close());
  }

  private requiredElement<T extends HTMLElement = HTMLElement>(selector: string): T {
    const element = this.appElement.querySelector<T>(selector);
    if (!element) throw new Error(`Required UI element not found: ${selector}`);
    return element;
  }

  private faqMarkup(): string {
    return faqItems
      .map(
        (item, index) => `
          <details class="faq-item" ${index === 0 ? 'open' : ''}>
            <summary>${escapeHtml(item.question)}</summary>
            <div class="faq-answer">
              ${item.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
              ${item.reference ? `<p class="faq-reference">${escapeHtml(item.reference)}</p>` : ''}
            </div>
          </details>
        `,
      )
      .join('');
  }

  private template(): string {
    return `
      <header class="topbar">
        <div class="topbar-controls">
          <div class="segmented-control" aria-label="Spatial view">
            <button type="button" data-spatial-mode="individual" class="is-active">Individual</button>
            <button type="button" data-spatial-mode="subbasins">Subbasins</button>
          </div>
          <div class="segmented-control feature-filter" aria-label="Feature type">
            <button type="button" data-feature-filter="lake" class="is-active"><span class="selector-icon selector-icon-lake" aria-hidden="true"></span>Lakes</button>
            <button type="button" data-feature-filter="reach"><span class="selector-icon selector-icon-river" aria-hidden="true"></span>Rivers</button>
          </div>
        </div>
        <div class="topbar-actions">
          <div class="theme-control" title="Switch light/dark mode">
            <img class="theme-icon" src="./assets/img/icon_theme-light.svg" alt="" aria-hidden="true" />
            <label class="toggle-switch">
              <input id="theme-toggle" type="checkbox" aria-label="Dark mode" />
              <span></span>
            </label>
            <img class="theme-icon" src="./assets/img/icon_theme-dark.svg" alt="" aria-hidden="true" />
          </div>
          <button id="faq-button" class="menu-button" type="button">FAQ</button>
        </div>
        </div>
      </header>

      <main class="map-shell">
        <div id="map" class="map"></div>
        <section class="period-control" aria-label="Map period">
          <div class="period-control-heading"><span>2026 · Mapping period</span><strong id="period-current">—</strong></div>
          <div class="period-slider-wrap">
            <input id="period-slider" class="period-slider" type="range" min="0" max="0" value="0" step="1" aria-label="Select time period" />
            <div id="period-ticks" class="period-ticks"></div>
          </div>
        </section>
        <div id="inset-map" class="global-inset" role="img" aria-label="Europe inset showing the current map extent"></div>
        <div id="map-legend" class="map-legend"></div>
        <div id="map-tooltip" class="map-tooltip"></div>
        <div id="error-banner" class="error-banner"></div>
        <aside id="feature-panel" class="feature-panel">
          <button id="feature-close" class="panel-close" type="button" aria-label="Close feature panel">×</button>
          <div id="feature-panel-body"></div>
        </aside>
      </main>

      <footer class="footerbar">
        <div class="bottom-bar-text">
          Drought from Space: Europe 2026 was developed by <a href="https://www.eawag.ch/en/department/surf/main-focus/remote-sensing/" target="_blank" rel="noopener noreferrer">Eawag</a> as part of the
          <a href="https://www.sos-water.eu" target="_blank" rel="noopener noreferrer">SOS-Water project</a>,
          which has received funding from the European Union’s Horizon Europe research and innovation programme under grant agreement No. 101059264 as well as the Swiss State Secretariat for Education, Research and Innovation (SERI).
        </div>
        <img id="funding-eu-logo" class="bottom-bar-logo bottom-bar-logo-eu" src="./assets/img/img_eu-funding-light.png" alt="European Union funding acknowledgement" />
        <img id="funding-seri-logo" class="bottom-bar-logo bottom-bar-logo-seri" src="./assets/img/img_seri-funding-light.png" alt="SERI funding acknowledgement" />
      </footer>

      <dialog id="faq-dialog" class="modal faq-modal">
        <div class="modal-content">
          <div class="modal-heading"><div><span class="eyebrow">About the data</span><h2>Frequently asked questions</h2></div><button id="faq-close" class="modal-close" type="button" aria-label="Close FAQ">×</button></div>
          <div class="faq-list">${this.faqMarkup()}</div>
        </div>
      </dialog>
    `;
  }
}
