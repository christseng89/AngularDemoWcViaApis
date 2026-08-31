import { access, readdir, readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
for (const [key, value] of Object.entries(packageJson.exports)) {
  const target = typeof value === 'string' ? value : value.default;
  await access(new URL(`..${target.slice(1)}`, import.meta.url));
  console.log(`verified ${key} -> ${target}`);
}
const manifest = JSON.parse(await readFile(new URL('../dist/balance-component-wc/browser/asset-manifest.json', import.meta.url), 'utf8'));
if (manifest.contractVersion !== '1' || !manifest.assets['main.js'] || !manifest.assets['styles.css']) {
  throw new Error('Release manifest is missing contract or core assets.');
}
const browserOutput = new URL('../dist/balance-component-wc/browser/', import.meta.url);
for (const name of (await readdir(browserOutput)).filter((asset) => asset.endsWith('.js'))) {
  const bundle = await readFile(new URL(name, browserOutput), 'utf8');
  if (/from["'](?:react|vue)["']|require\(["'](?:react|vue)["']\)/.test(bundle)) {
    throw new Error(`React or Vue runtime leaked into WC asset ${name}.`);
  }
}
console.log('release verification passed; core bundle excludes React and Vue runtimes');
