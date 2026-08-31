import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';

const output = new URL('../dist/e2e-hosts/', import.meta.url);
await mkdir(output, { recursive: true });
for (const framework of ['angular', 'react', 'vue']) {
  await build({
    entryPoints: [new URL(`../e2e/hosts/${framework}.ts`, import.meta.url).pathname.slice(1)],
    outfile: new URL(`${framework}.js`, output).pathname.slice(1),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    sourcemap: true,
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  await writeFile(
    new URL(`${framework}.html`, output),
    `<!doctype html><html><body>${framework === 'angular' ? '<app-e2e-host></app-e2e-host>' : '<div id="host"></div>'}<script type="module" src="/wc/polyfills.js"></script><script type="module" src="/wc/main.js"></script><script type="module" src="/${framework}.js"></script></body></html>`,
  );
}
console.log('Built Angular, React and Vue E2E host fixtures.');
