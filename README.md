# Drought from Space: Europe 2026 — Interactive Portal

[![Website](https://img.shields.io/badge/Website-Drought_from_Space-blue)](https://drought.fromspace.app)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache--2.0-blue)](LICENSE)

**Drought from Space: Europe 2026** is an interactive mapping application of lake and river water-level conditions derived from the [Surface Water and Ocean Topography (SWOT)](https://swot.jpl.nasa.gov/) satellite mission [`1`, `2`]. Explore recent seasonal conditions across Europe, inspect individual waterbodies, and compare aggregated conditions within river subbasins.

This web application was developed as part of SOS-Water project - Water Resources System Safe Operating Space in a Changing Climate and Society ([DOI:10.3030/101059264](https://cordis.europa.eu/project/id/101059264)). SOS-Water is an EU-funded project (2022–2026) that aims to define a safe operating space (SOS) for water resources, accounting concurrently for all relevant water dimensions across multiple sectors and spatial scales under socio-economic, policy, technological, and climatic change.

Check out the project website at [sos-water.eu](https://sos-water.eu) for more information on the project.

> [1] **SWOT (2025).** *SWOT Level 2 Lake Single-Pass Vector Data Product, Version D*. NASA Physical Oceanography Distributed Active Archive Center. [doi:10.5067/SWOT-LAKESP-D](https://doi.org/10.5067/SWOT-LAKESP-D).

> [2] **SWOT (2025).** *SWOT Level 2 River Single-Pass Vector Data Product, Version D*. NASA Physical Oceanography Distributed Active Archive Center. [doi:10.5067/SWOT-RIVERSP-D](https://doi.org/10.5067/SWOT-RIVERSP-D).

## Architecture

The portal is a **static Vite / TypeScript / MapLibre application**. All scientific calculations and data acquisition are performed by a separate SWOT Europe Drought Pipeline.

The portal serves precomputed spatial fields, PMTiles archives and compact, indexed period and time-series records. Browsers load only the relevant map tiles or feature records through HTTP byte-range requests. No application server or live SWOT API is required.

```text
swot-europe-drought-pipeline/
  build/publication/            generated scientific and web products

swot-europe-drought-portal/
  src/                          portal frontend
  public/intro/                 introduction graphics
  public/data/                  published browser data
```

## Deployment
### Local deployment

Install Node.js (compatible with the Vite version in `package.json`), then run:

```powershell
npm ci
npm run dev
```

To update the portal's local data after running the pipeline, keep the repositories in sibling directories and run:

```powershell
npm run data:sync
npm run verify:data
npm run audit:data
```

The synchronization command copies the optimized web files from `../swot-europe-drought-pipeline/build/publication/` into `public/data/`. Scientific Parquet exports remain in the pipeline output. To use a different publication directory, set `SWOT_DROUGHT_DATA_DIR` in the environment.

Build and preview the static website:

```powershell
npm run build
npm run preview
```

### Github/Gitlab Pages Deployment

The repository is designed to be hosted as a lightweight Gitlab/GitHub Pages application. The underyling prepared datasets files are included in the static website. Hosting must support partial-content (`206`) responses for the indexed binary data. Use `npm run audit:data` to check published size and file-size constraints before deployment.

## Licence and citation

### Licence

The original source code of *Drought from Space: Europe 2026 — Interactive Portal* is licensed under the [Apache License 2.0](LICENSE). Copyright and attribution information is provided in [NOTICE](NOTICE).

Third-party datasets, basemaps, imagery, institutional logos and other external resources are not covered by the software licence and retain their respective terms and conditions.

### Citation

If you use this portal in scientific research, publications, presentations or other public-facing work, please cite:

> Brechbühler, M. (2026). *Drought from Space: Europe 2026* [Computer software]. Eawag, Swiss Federal Institute of Aquatic Science and Technology. https://github.com/mibrechb/swot-europe-drought-portal

Machine-readable citation metadata are available in [CITATION.cff](CITATION.cff).

**Underlying scientific data:** The portal uses SWOT observations and associated reference datasets. When using or discussing these data, please also cite the relevant original data products and scientific publications listed in the data attribution section of this README.

Scholarly citation is requested to acknowledge the scientific and software contributions and is distinct from the legal requirements of the Apache-2.0 licence.

## Funding and acknowledgements

This application was developed within the [SOS-Water project](https://cordis.europa.eu/project/id/101059264), funded by the European Union's Horizon Europe research and innovation programme (grant agreement **101059264**) and the Swiss State Secretariat for Education, Research and Innovation (SERI). Views and opinions expressed are those of the authors and do not necessarily reflect those of the European Union or the granting authorities.
