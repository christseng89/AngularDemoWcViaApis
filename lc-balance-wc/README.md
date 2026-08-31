# Balance Component Web Component

將既有 Angular Balance UI 封裝成可由 Angular、React、Vue 或原生瀏覽器宿主共用的
`<balance-component-app>`。Web Component 是唯一執行實作；framework adapters 只負責型別、
DOM property、事件與方法轉接，不複製 Balance 業務邏輯。

## 五分鐘快速開始

```shell
npm ci
npm run release:prepare
```

部署 `dist/balance-component-wc/browser/` 的全部檔案並保持相對路徑，然後在宿主載入：

```html
<script src="/balance/polyfills.js"></script>
<script type="module" src="/balance/main.js"></script>
<balance-component-app id="balance"></balance-component-app>
<script type="module">
  const balance = document.querySelector('#balance');
  balance.config = { version: '1', initialView: 'transaction-builder', theme: 'system' };
  balance.addEventListener('balance-error', ({ detail }) => console.error(detail));
  await balance.navigate('business-cases');
</script>
```

`config` 必須設定為 DOM property，不可序列化成 attribute。宿主必須把既有 `/api/*` 與
`/balance-component/*` 路徑轉送至現有服務；WC 不接受 token attribute，也不實作認證。

## 文件入口

- [Angular／React／Vue 完整使用指南](docs/web-component-usage.md)
- [HTTP 查詢重試政策](docs/http-retry-policy.md)
- [整合與部署總覽](docs/web-component.md)
- [Angular／React／Vue 範例](docs/framework-integrations.md)
- [公開契約參考](docs/web-component-contract.md)
- [Shadow DOM、主題與 CSS tokens](docs/web-component-styling.md)
- [版本、維護與棄用政策](docs/web-component-governance.md)
- [發布、部署、回滾與疑難排解](docs/web-component-operations.md)
- [測試策略與 release gates](docs/web-component-testing.md)
- [版本 1 升級指南](docs/migrations/web-component-v1.md)

## 驗證

```shell
npm run lint
npm test -- --runInBand
npm run typecheck:wc
npm run typecheck:adapters
npm run e2e
npm run release:verify
npm pack --dry-run
```

實際發布不屬於自動驗證流程；任何 registry publish 都需要 release owner 明確核准。
