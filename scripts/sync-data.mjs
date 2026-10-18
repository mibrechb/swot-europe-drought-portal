import {cp, mkdir, rm, readFile, stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import process from 'node:process';

const portalRoot = resolve(import.meta.dirname, '..');
const defaultDataRoot = resolve(portalRoot, '..', 'swot-europe-drought-pipeline', 'build', 'publication');
const dataRoot = resolve(process.env.SWOT_DROUGHT_DATA_DIR ?? defaultDataRoot);
const targetRoot = resolve(portalRoot, 'public', 'data');

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

const manifestPath = resolve(dataRoot, 'manifest.json');
const latestPath = resolve(dataRoot, 'latest');
const requiredDirectories = ['windows', 'timeseries', 'fields', 'features', 'geometry'];
const requiredFiles = [
  resolve(latestPath, 'geometry', 'index.json'),
  resolve(latestPath, 'features', 'index.json'),
  resolve(latestPath, 'timeseries', 'index.json'),
  resolve(latestPath, 'fields', 'index.json'),
];

if (!(await exists(manifestPath))) {
  throw new Error(
    `Published data not found in ${dataRoot}. ` +
      'Run the pipeline publication build first or set SWOT_DROUGHT_DATA_DIR.',
  );
}

for (const directoryName of requiredDirectories) {
  const sourceDirectory = resolve(latestPath, directoryName);
  if (!(await exists(sourceDirectory))) {
    throw new Error(
      `Required portal artifact directory ${directoryName} is missing in ${latestPath}. ` +
        'Rebuild the publication with the current pipeline source.',
    );
  }
}

for (const requiredFile of requiredFiles) {
  if (!(await exists(requiredFile))) {
    throw new Error(
      `Required portal artifact ${requiredFile} is missing. ` +
        'Rebuild the publication with the current pipeline source.',
    );
  }
}

await rm(targetRoot, {recursive: true, force: true});
await mkdir(resolve(targetRoot, 'latest'), {recursive: true});
await cp(manifestPath, resolve(targetRoot, 'manifest.json'));
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
for (const directoryName of requiredDirectories) {
  await cp(
    resolve(latestPath, directoryName),
    resolve(targetRoot, 'latest', directoryName),
    {recursive: true},
  );
}

if (manifest.basins) {
  const source = resolve(latestPath, 'basins');
  if (!(await exists(source))) {
    throw new Error('Manifest references HydroBASINS products but latest/basins is missing.');
  }
  await cp(source, resolve(targetRoot, 'latest', 'basins'), {recursive: true});
}

console.log(`Synced published pipeline data from ${dataRoot}`);
