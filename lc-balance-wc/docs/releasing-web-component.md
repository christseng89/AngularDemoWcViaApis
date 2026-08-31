# Releasing the Balance Web Component

No registry publication is performed by the verification workflow.

Release owner必須保存命令結果、`asset-manifest.json`與 pack metadata。部署及失敗處理見
[operations runbook](web-component-operations.md)，相容性判定見
[governance policy](web-component-governance.md)，測試層級見
[testing strategy](web-component-testing.md)。

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

Checklist：OAS review record已更新、audit無 high findings、Jest與 Playwright全過、所有 typecheck
及 builds通過、manifest完整、bundle無 React/Vue runtime、tarball consumer smoke通過、rollback版本
可用。完成後仍不得由自動化直接 publish。

Public exports include `./wc`, `./wc/styles.css`, `./manifest`, `./contract`, and the Angular,
React and Vue adapter entry points. The manifest records byte size and SHA-256 for each deterministic
WC asset. React and Vue remain host-provided optional peers and are not linked into the core bundle.

Consumers must load `polyfills.js`, `main.js` and the co-located `styles.css`. The element contract
version remains `1`; changing event detail or method semantics requires a versioned contract change.
