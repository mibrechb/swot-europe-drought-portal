import './intro.css';

/** Mount the introductory experience over the live, already-mounted map. */
export function mountIntroOverlay(onDismiss: () => void): void {
  document.body.classList.add('intro-active');
  const portal = document.querySelector<HTMLElement>('#app');
  if (portal) portal.inert = true;

  const overlay = document.createElement('div');
  overlay.id = 'intro-overlay';
  overlay.className = 'intro-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'intro-title');
  overlay.tabIndex = -1;
  overlay.innerHTML = `

    <div class="shade" aria-hidden="true"></div>

    <div class="observation-stage" id="observationStage" aria-hidden="true">
      <svg class="observation-map" viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid meet">
        <defs>
          <clipPath id="leftSwathClip"><path id="leftSwathClipPath"></path></clipPath>
          <clipPath id="rightSwathClip"><path id="rightSwathClipPath"></path></clipPath>
          <filter id="leadingEdgeHalo" x="-70%" y="-100%" width="240%" height="300%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
          <linearGradient id="edgeFade" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ee9630" stop-opacity="0" />
            <stop offset="45%" stop-color="#ee9630" stop-opacity="0.08" />
            <stop offset="100%" stop-color="#ee9630" stop-opacity="0.68" />
          </linearGradient>
        </defs>

        <image href="./intro/phase-overlay-cubehelix-detailed.webp" x="-800" y="-560" width="2800" height="2036" preserveAspectRatio="none" class="swath-overlay" clip-path="url(#leftSwathClip)"></image>
        <image href="./intro/phase-overlay-cubehelix-detailed.webp" x="-800" y="-560" width="2800" height="2036" preserveAspectRatio="none" class="swath-overlay" clip-path="url(#rightSwathClip)"></image>

        <path id="leftCoverage" class="coverage-boundary"></path>
        <path id="rightCoverage" class="coverage-boundary"></path>
        <path id="centerTrack" class="ground-track"></path>
        <g id="scanGeometry" class="leading-edges">
          <path id="leftEdgeFade" class="edge-fade"></path>
          <path id="rightEdgeFade" class="edge-fade"></path>
          <path id="leftEdgeHalo" class="edge-halo" filter="url(#leadingEdgeHalo)"></path>
          <path id="rightEdgeHalo" class="edge-halo" filter="url(#leadingEdgeHalo)"></path>
          <path id="leftEdgeLine" class="edge-line"></path>
          <path id="rightEdgeLine" class="edge-line"></path>
        </g>
        <image id="satelliteSvg" href="./intro/swot-redraw.webp" x="0" y="0" width="235" height="176.25" preserveAspectRatio="xMidYMid meet"></image>
      </svg>
    </div>

    <section class="panel" id="intro-panel" aria-labelledby="intro-title">
      <h1 id="intro-title">Europe’s 2026 drought,<br><em>seen from space.</em></h1>
      <p class="lead">
        In 2026, drought has affected parts of Europe, putting pressure on freshwater resources. One of its visible impacts is unusually low water levels in rivers and lakes.
        This portal uses <strong>water-level observations from the SWOT satellite’s KaRIn radar instrument</strong> to investigate these changes across Europe.
      </p>
      <p>
        The heatmap shows <strong>relative water-level changes in 2026</strong> compared with the same seasonal periods during <strong>2023–2025</strong>.
        Users can explore the spatial extent and magnitude of these changes and select individual lakes and rivers to inspect their water-level time series. Switching to the <strong>sub-basin view</strong> allows users to investigate and compare regional statistics.
      </p>
      <a class="data-explorer" href="https://swot.eawag.ch/" target="_blank" rel="noopener noreferrer" aria-label="Open the SWOT Lake and River Explorer in a new tab">
        <img src="./intro/swot-data-explorer_favicon.png" alt="" width="48" height="48">
        <span>Interested in extracting your own SWOT water-level time series? Visit the <strong>SWOT Lake and River Explorer</strong>. <span class="external-arrow" aria-hidden="true">↗</span></span>
      </a>
      <dl class="facts">
        <div><dt>Observed from space</dt><dd>SWOT KaRIn radar altimetry</dd></div>
        <div><dt>Compared through time</dt><dd>2026 against the 2023–2025 baseline</dd></div>
        <div><dt>Explore interactively</dt><dd>Heatmap, lakes, rivers, sub-basins</dd></div>
      </dl>
      <div class="legend" aria-label="Water level changes relative to baseline">
        <span>Lower water levels</span>
        <div class="legend-bar"></div>
        <span>Higher water levels</span>
      </div>
      <div class="actions"><button class="button-primary" id="intro-enter" type="button">Explore the map</button></div>
    </section>

    <nav class="acknowledgements" aria-label="Project and institutional acknowledgements">
      <a href="https://sos-water.eu" target="_blank" rel="noopener noreferrer" aria-label="SOS-Water project (opens in a new tab)"><img src="./intro/logo_sosw.png" alt="SOS-Water" class="sos-logo"></a>
      <a href="https://www.eawag.ch/en/department/surf/main-focus/remote-sensing/" target="_blank" rel="noopener noreferrer" aria-label="Eawag remote sensing (opens in a new tab)"><img src="./intro/logo_eawag-white.png" alt="Eawag" class="eawag-logo"></a>
    </nav>
  `;
  document.body.append(overlay);
  overlay.focus({preventScroll: true});

  const required = <T extends Element>(selector: string): T => {
    const element = overlay.querySelector<T>(selector);
    if (!element) throw new Error(`Missing intro element: ${selector}`);
    return element;
  };
  const satellite = required<SVGImageElement>('#satelliteSvg');
  const coverageLeft = required<SVGPathElement>('#leftCoverage');
  const coverageRight = required<SVGPathElement>('#rightCoverage');
  const centerTrack = required<SVGPathElement>('#centerTrack');
  const leftEdgeFade = required<SVGPathElement>('#leftEdgeFade');
  const rightEdgeFade = required<SVGPathElement>('#rightEdgeFade');
  const leftEdgeHalo = required<SVGPathElement>('#leftEdgeHalo');
  const rightEdgeHalo = required<SVGPathElement>('#rightEdgeHalo');
  const leftEdgeLine = required<SVGPathElement>('#leftEdgeLine');
  const rightEdgeLine = required<SVGPathElement>('#rightEdgeLine');
  const edgeFadeGradient = required<SVGLinearGradientElement>('#edgeFade');
  const leftSwathClipPath = required<SVGPathElement>('#leftSwathClipPath');
  const rightSwathClipPath = required<SVGPathElement>('#rightSwathClipPath');

  const start = {x: 1350, y: -275};
  const end = {x: -120, y: 820};
  const norm = Math.hypot(end.x - start.x, end.y - start.y);
  const along = {x: (end.x - start.x) / norm, y: (end.y - start.y) / norm};
  const cross = {x: -along.y, y: along.x};
  const durationMs = 8000;
  const animationDelayMs = 500;
  const satWidth = 235;
  const satHeight = 176.25;
  const satelliteSpeed = 1.1;
  const satelliteFinalScale = 1.75;
  const satelliteAlongOffset = 0;
  const satelliteCrossOffset = -50;
  const satelliteExitOffset = 120;
  const swathHalfSpan = 112;
  const nadirHalfGap = swathHalfSpan * 20 / (50 + 20 + 50);
  let frameId: number | null = null;
  let launchTime: number | null = null;
  let entered = false;

  const point = (base: {x: number; y: number}, offset: number, distance = 0) => ({
    x: base.x + cross.x * offset + along.x * distance,
    y: base.y + cross.y * offset + along.y * distance,
  });
  const coords = (value: {x: number; y: number}) => `${value.x.toFixed(1)} ${value.y.toFixed(1)}`;
  const segment = (a: {x: number; y: number}, b: {x: number; y: number}) =>
    `M ${coords(a)} L ${coords(b)}`;
  const quadrilateral = (
    a: {x: number; y: number}, b: {x: number; y: number},
    c: {x: number; y: number}, d: {x: number; y: number},
  ) => `M ${coords(a)} L ${coords(b)} L ${coords(c)} L ${coords(d)} Z`;

  function render(t: number): void {
    const head = {x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t};
    const swathFront = point(head, 0, 18);
    const leftSwath = quadrilateral(
      point(start, -swathHalfSpan), point(start, -nadirHalfGap),
      point(swathFront, -nadirHalfGap), point(swathFront, -swathHalfSpan),
    );
    const rightSwath = quadrilateral(
      point(start, nadirHalfGap), point(start, swathHalfSpan),
      point(swathFront, swathHalfSpan), point(swathFront, nadirHalfGap),
    );
    leftSwathClipPath.setAttribute('d', leftSwath);
    rightSwathClipPath.setAttribute('d', rightSwath);
    coverageLeft.setAttribute('d', leftSwath);
    coverageRight.setAttribute('d', rightSwath);
    centerTrack.setAttribute('d', segment(start, head));

    const fadeBack = point(swathFront, 0, -48);
    leftEdgeFade.setAttribute('d', quadrilateral(
      point(fadeBack, -swathHalfSpan), point(fadeBack, -nadirHalfGap),
      point(swathFront, -nadirHalfGap), point(swathFront, -swathHalfSpan),
    ));
    rightEdgeFade.setAttribute('d', quadrilateral(
      point(fadeBack, nadirHalfGap), point(fadeBack, swathHalfSpan),
      point(swathFront, swathHalfSpan), point(swathFront, nadirHalfGap),
    ));
    const leftEdge = segment(point(swathFront, -swathHalfSpan), point(swathFront, -nadirHalfGap));
    const rightEdge = segment(point(swathFront, nadirHalfGap), point(swathFront, swathHalfSpan));
    leftEdgeHalo.setAttribute('d', leftEdge);
    rightEdgeHalo.setAttribute('d', rightEdge);
    leftEdgeLine.setAttribute('d', leftEdge);
    rightEdgeLine.setAttribute('d', rightEdge);
    edgeFadeGradient.setAttribute('x1', fadeBack.x.toFixed(2));
    edgeFadeGradient.setAttribute('y1', fadeBack.y.toFixed(2));
    edgeFadeGradient.setAttribute('x2', swathFront.x.toFixed(2));
    edgeFadeGradient.setAttribute('y2', swathFront.y.toFixed(2));
    const approach = t * t * (3 - 2 * t);
    const satScale = 1 + (satelliteFinalScale - 1) * approach;
    const satelliteHead = point({
      x: start.x + (end.x - start.x) * t * satelliteSpeed,
      y: start.y + (end.y - start.y) * t * satelliteSpeed,
    }, satelliteCrossOffset, satelliteAlongOffset + satelliteExitOffset * approach);
    const width = satWidth * satScale;
    const height = satHeight * satScale;
    satellite.setAttribute('x', (satelliteHead.x - width / 2).toFixed(1));
    satellite.setAttribute('y', (satelliteHead.y - height / 2).toFixed(1));
    satellite.setAttribute('width', width.toFixed(1));
    satellite.setAttribute('height', height.toFixed(1));
  }

  function animate(timestamp: number): void {
    if (launchTime === null) launchTime = timestamp;
    const elapsedMs = Math.max(0, timestamp - launchTime - animationDelayMs);
    const t = Math.min(1, elapsedMs / durationMs);
    render(t);
    frameId = t < 1 ? requestAnimationFrame(animate) : null;
  }

  function dismiss(): void {
    if (entered) return;
    entered = true;
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    overlay.classList.add('is-leaving');
    document.body.classList.remove('intro-active');
    if (portal) portal.inert = false;
    onDismiss();
    window.setTimeout(() => overlay.remove(), 480);
    document.querySelector<HTMLButtonElement>('[data-feature-filter="lake"]')?.focus({preventScroll: true});
  }

  required<HTMLButtonElement>('#intro-enter').addEventListener('click', dismiss);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    render(0.5);
  } else {
    render(0);
    frameId = requestAnimationFrame(animate);
  }
}
