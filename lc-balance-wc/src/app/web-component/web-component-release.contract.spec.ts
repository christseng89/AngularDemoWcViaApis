import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Web Component release contract', () => {
  const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
    exports: Record<string, unknown>;
    peerDependencies: Record<string, string>;
    peerDependenciesMeta: Record<string, { optional: boolean }>;
    scripts: Record<string, string>;
  };

  it('publishes core assets, contract and three adapter subpaths', () => {
    expect(Object.keys(packageJson.exports)).toEqual(
      expect.arrayContaining(['./wc', './wc/styles.css', './manifest', './contract', './adapters/angular', './adapters/react', './adapters/vue']),
    );
  });

  it('keeps framework runtimes optional peers and exposes CI release gates', () => {
    for (const peer of ['@angular/core', 'react', 'vue']) {
      expect(packageJson.peerDependencies[peer]).toBeDefined();
      expect(packageJson.peerDependenciesMeta[peer]?.optional).toBe(true);
    }
    expect(packageJson.scripts).toEqual(
      expect.objectContaining({
        'typecheck:adapters': expect.any(String),
        e2e: 'playwright test',
        'release:prepare': expect.any(String),
        'release:verify': expect.any(String),
      }),
    );
  });
});
