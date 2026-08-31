# Releasing the Balance Web Component

No registry publication is performed by the verification workflow.

```shell
npm ci
npm run lint
npm test -- --runInBand
npm run typecheck:wc
npm run typecheck:adapters
npm run e2e
npm run release:prepare
npm run release:verify
npm pack --dry-run
```

Public exports include `./wc`, `./wc/styles.css`, `./manifest`, `./contract`, and the Angular,
React and Vue adapter entry points. The manifest records byte size and SHA-256 for each deterministic
WC asset. React and Vue remain host-provided optional peers and are not linked into the core bundle.

Consumers must load `polyfills.js`, `main.js` and the co-located `styles.css`. The element contract
version remains `1`; changing event detail or method semantics requires a versioned contract change.
