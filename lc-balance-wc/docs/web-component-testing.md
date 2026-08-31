# Web Component 測試策略

測試採三層結構：Jest unit／contract tests作快速基礎；Angular、React、Vue真實 runtime bundles作
integration fixtures；Playwright以本機 Chrome驗證 browser contract。不得以單一 E2E取代 typed
contract tests，也不得只測 adapter而跳過 native element。

## 必要 gates

```shell
npm test -- --runInBand
npm run typecheck:wc
npm run typecheck:adapters
npm run e2e
npm run docs:verify
npm run release:verify
```

Contract coverage至少包含 config property、ready、navigation、refresh、error codes、Promise methods、
Shadow DOM/theme、多實例及 disconnected element。Adapter coverage包含 property assignment、event
mapping、method forwarding與 unmount cleanup。Playwright覆蓋三個 framework hosts及 invalid config。

Release smoke另需 App/WC production builds、audit、manifest、bundle runtime inspection、pack dry-run與
乾淨 tarball consumer。測試失敗不得以更新 snapshot或降低 coverage threshold直接繞過；先判斷是
contract regression、fixture問題或環境問題。
