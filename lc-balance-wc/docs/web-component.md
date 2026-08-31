# Balance Component Web Component（Phase 1）

## 交付范围

Phase 1 在保留既有 Angular 应用模式的同时，提供独立注册的 `<balance-component-app>` Custom Element。Web Component 使用自己的视图状态切换 Transaction Builder 与 Business Case Runner，不读取或修改宿主应用 Router。

本阶段只增加浏览器集成边界，不修改 Balance 业务规则、请求 payload、HTTP endpoint 或响应 schema。因此 `analysis/balance-component-api.yaml` 与 `analysis/balance-component-channel-api.yaml` 已复核并保持不变。

## 构建与部署

```bash
npm run build:wc
```

产物位于 `dist/balance-component-wc/browser/`。宿主必须一起部署该目录内的 `main.js`、`polyfills.js`、`styles.css`、共享 chunk 和两个按需加载的视图 chunk，并保持它们的相对路径。既有应用仍使用：

```bash
npm run build
```

其输出仍位于 `dist/lc-balance-wc/browser/`。

## 宿主用法

```html
<link rel="stylesheet" href="/balance-component/styles.css" />
<script src="/balance-component/polyfills.js"></script>
<script type="module" src="/balance-component/main.js"></script>

<balance-component-app id="balance"></balance-component-app>
<script type="module">
  const element = document.querySelector('#balance');
  element.config = { version: '1', initialView: 'transaction-builder' };
  element.addEventListener('balance-ready', ({ detail }) => console.log(detail));
  element.addEventListener('balance-navigation', ({ detail }) => console.log(detail));
  element.addEventListener('balance-error', ({ detail }) => console.error(detail));
</script>
```

配置必须通过 DOM property 传入，不应把对象 JSON 塞入 HTML attribute。省略配置时默认打开 `transaction-builder`。

## 公共契约

- `config.version`：当前仅支持 `'1'`。
- `config.initialView`：`'transaction-builder'` 或 `'business-cases'`。
- `balance-ready`：Angular 壳层和初始视图加载完成；`detail` 包含 `version`、`view`。
- `balance-navigation`：内部视图实际变化；`detail` 包含 `from`、`to`。
- `balance-error`：配置版本无效或视图加载失败；`detail` 包含稳定的 `code` 与可读 `message`。

TypeScript 定义以 `src/app/web-component/balance-component-element.contract.ts` 为准。注册函数是幂等的，同一 `CustomElementRegistry` 中不会重复定义标签。

## 边界与运行前提

- Web Component 不提供 Router，也不改变宿主 URL。
- 业务视图继续调用既有相对 HTTP 路径：`/api/*` 与 `/balance-component/*`。宿主环境必须把这些路径转发到现有 Backend Orchestrator 与 Balance Microservice。
- Phase 1 未使用 Shadow DOM；Bootstrap 与 `src/styles.scss` 作为独立 `styles.css` 交付，宿主需要显式加载。
- Angular 应用与 Web Component 共用相同的 DI/Formly provider 定义，但只有应用模式额外安装 Router provider。
