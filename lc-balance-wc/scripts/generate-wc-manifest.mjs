import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const output = new URL('../dist/balance-component-wc/browser/', import.meta.url);
const names = (await readdir(output)).filter((name) => !name.endsWith('.map') && name !== 'asset-manifest.json').sort();
const assets = {};
for (const name of names) {
  const content = await readFile(new URL(name, output));
  assets[name] = { bytes: content.byteLength, sha256: createHash('sha256').update(content).digest('hex') };
}
await writeFile(new URL('asset-manifest.json', output), `${JSON.stringify({ contractVersion: '1', assets }, null, 2)}\n`);
console.log(`Generated deterministic manifest for ${Object.keys(assets).length} assets at ${join('dist', 'balance-component-wc', 'browser')}.`);
