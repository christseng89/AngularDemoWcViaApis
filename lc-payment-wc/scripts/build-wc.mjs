// Bundles the vanilla Custom Elements in src/app/web-components into a
// standalone, framework-free build — no Angular, no zone.js.
//
// Output (dist/wc/):
//   lc-payment-wc.js      IIFE — plain <script src="..."> drop-in for HTML
//   lc-payment-wc.esm.js  ESM  — `import './lc-payment-wc.esm.js'` from Vue/React
import { build, context } from 'esbuild';
import { mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const entry = path.join(root, 'src/app/web-components/index.ts');
const outDir = path.join(root, 'dist/wc');
const watch = process.argv.includes('--watch');

mkdirSync(outDir, { recursive: true });

const shared = {
  entryPoints: [entry],
  bundle: true,
  minify: true,
  sourcemap: true,
  target: ['es2020'],
  logLevel: 'info',
};

const targets = [
  { ...shared, format: 'iife', outfile: path.join(outDir, 'lc-payment-wc.js') },
  { ...shared, format: 'esm', outfile: path.join(outDir, 'lc-payment-wc.esm.js') },
];

function copyDemo() {
  copyFileSync(path.join(root, 'demo/index.html'), path.join(outDir, 'index.html'));
}

if (watch) {
  const ctxs = await Promise.all(targets.map(opts => context(opts)));
  await Promise.all(ctxs.map(ctx => ctx.watch()));
  copyDemo();
  console.log(`✔ Watching web-components build → ${outDir}`);
} else {
  await Promise.all(targets.map(opts => build(opts)));
  copyDemo();
  console.log(`✔ Web Components bundle built → ${outDir}`);
}
