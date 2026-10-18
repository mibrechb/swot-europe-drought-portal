/** Report static publication size and enforce GitHub file/site limits. */
import {readFile, readdir, stat} from 'node:fs/promises';
import {resolve, relative, join} from 'node:path';
import process from 'node:process';

const root = resolve(import.meta.dirname, '..', 'public', 'data');
const mib = 1024 * 1024;
const maxFileBytes = 100 * mib;
const maxSiteBytes = 1000 * 1000 * 1000;
const groups = new Map();
const largest = [];
let total = 0;
let tooBig = false;

async function visit(path) {
  for (const entry of await readdir(path, {withFileTypes: true})) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) {
      await visit(child);
    } else if (entry.isFile()) {
      const size = (await stat(child)).size;
      total += size;
      const name = relative(root, child);
      const group = name.split(/[\\/]/).slice(0, 2).join('/');
      groups.set(group, (groups.get(group) ?? 0) + size);
      largest.push({name, size});
      if (size > maxFileBytes) {
        tooBig = true;
        console.error(`Over GitHub's 100 MiB per-file limit: ${name}`);
      }
    }
  }
}

try {
  await readFile(join(root, 'manifest.json'));
  await visit(root);
} catch (error) {
  console.error(`No complete synced publication at ${root}: ${String(error)}`);
  process.exit(1);
}
console.log(`Total published data: ${(total / mib).toFixed(1)} MiB`);
console.log('Data products:');
for (const [group, bytes] of [...groups].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${group}: ${(bytes / mib).toFixed(1)} MiB`);
}
console.log('Five largest files:');
for (const {name, size} of largest.sort((a, b) => b.size - a.size).slice(0, 5)) {
  console.log(`  ${name}: ${(size / mib).toFixed(1)} MiB`);
}
if (total > maxSiteBytes) {
  console.error('Published data alone exceed the 1 GB GitHub Pages site limit.');
  tooBig = true;
}
if (tooBig) process.exitCode = 1;
else console.log('Data meet the per-file limit and are below 1 GB (frontend adds size).');
