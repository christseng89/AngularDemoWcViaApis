# Balance Component Web Component（Phase 1–2）

## 交付范围

Phase 1 在保留既有 Angular 应用模式的同时，提供独立注册的 `<balance-component-app>` Custom Element。Web Component 使用自己的视图状态切换 Transaction Builder 与 Business Case Runner，不读取或修改宿主应用 Router。

Phase 2 完成跨框架调用契约：React、Vue 或原生 JavaScript 可通过 DOM reference 调用 `navigate()`／`refresh()`，并订阅导航、刷新及错误事件。多个元素实例各自拥有独立的可变 view state 与事件来源。

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
  element.addEventListener('balance-refresh', ({ detail }) => console.log(detail));
  element.addEventListener('balance-error', ({ detail }) => console.error(detail));

  await element.navigate('business-cases');
  await element.refresh();
</script>
```

配置必须通过 DOM property 传入，不应把对象 JSON 塞入 HTML attribute。省略配置时默认打开 `transaction-builder`。

## 公共契约

- `config.version`：当前仅支持 `'1'`。
- `config.initialView`：`'transaction-builder'` 或 `'business-cases'`。
- `balance-ready`：Angular 壳层和初始视图加载完成；`detail` 包含 `version`、`view`。
- `balance-navigation`：内部视图实际变化；`detail` 包含 `from`、`to`。
- `balance-refresh`：当前 Angular view 已重建；`detail` 包含 `view`。
- `balance-error`：配置版本、view、连接状态或视图加载失败；`detail` 包含稳定的 `code`、`operation`、可读 `message` 与适用时的 `view`。
- `navigate(view): Promise<void>`：切换至指定 view；成功加载后 resolve，失败时 reject 并派发 `balance-error`。
- `refresh(): Promise<void>`：重建当前 Angular view，不重新下载已加载的 JavaScript bundle；完成后派发 `balance-refresh`。

TypeScript 定义以 `src/app/web-component/balance-component-element.contract.ts` 为准。注册函数是幂等的，同一 `CustomElementRegistry` 中不会重复定义标签。

公开方法必须在元素连接到 DOM 后调用。方法失败不会清空最后一个可用 view。认证、token、header 与 API base URL 不属于 Phase 2；请求继续沿用既有相对路径和宿主 reverse proxy。

## 多实例

同一页面可以放置多个 `<balance-component-app>`。每个实例的配置、当前 view、refresh lifecycle 和 Custom Events 均独立；宿主应在对应元素本身监听事件，不应以全局事件总线混合实例状态。

## 边界与运行前提

- Web Component 不提供 Router，也不改变宿主 URL。
- 业务视图继续调用既有相对 HTTP 路径：`/api/*` 与 `/balance-component/*`。宿主环境必须把这些路径转发到现有 Backend Orchestrator 与 Balance Microservice。
- Phase 1 未使用 Shadow DOM；Bootstrap 与 `src/styles.scss` 作为独立 `styles.css` 交付，宿主需要显式加载。
- Angular 应用与 Web Component 共用相同的 DI/Formly provider 定义，但只有应用模式额外安装 Router provider。
