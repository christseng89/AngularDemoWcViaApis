# Balance Component Web Component（Phase 1–3）

## 交付范围

Phase 1 在保留既有 Angular 应用模式的同时，提供独立注册的 `<balance-component-app>` Custom Element。Web Component 使用自己的视图状态切换 Transaction Builder 与 Business Case Runner，不读取或修改宿主应用 Router。

Phase 2 完成跨框架调用契约：React、Vue 或原生 JavaScript 可通过 DOM reference 调用 `navigate()`／`refresh()`，并订阅导航、刷新及错误事件。多个元素实例各自拥有独立的可变 view state 与事件来源。

Phase 3 以原生 Shadow DOM 隔离宿主与 Angular UI 的样式和执行环境。Bootstrap、global SCSS 与 lazy component styles 全部在每个 shadow root 内生效，不会要求 React／Vue 宿主加载 Balance 的全局 CSS。

本阶段只增加浏览器集成边界，不修改 Balance 业务规则、请求 payload、HTTP endpoint 或响应 schema。因此 `analysis/balance-component-api.yaml` 与 `analysis/balance-component-channel-api.yaml` 已复核并保持不变。

## 构建与部署

```bash
npm run build:wc
```

产物位于 `dist/balance-component-wc/browser/`。宿主必须一起部署该目录内的 `main.js`、`polyfills.js`、`styles.css`、共享 chunk 和两个按需加载的视图 chunk，并保持它们的相对路径。`main.js` 会自动从自己的 URL 推导同目录 `styles.css` 并加载到 shadow root；宿主不得再把 `styles.css` 作为全局 stylesheet 引入。既有应用仍使用：

```bash
npm run build
```

其输出仍位于 `dist/lc-balance-wc/browser/`。

## 宿主用法

```html
<script src="/balance-component/polyfills.js"></script>
<script type="module" src="/balance-component/main.js"></script>

<balance-component-app id="balance"></balance-component-app>
<script type="module">
  const element = document.querySelector('#balance');
  element.config = { version: '1', initialView: 'transaction-builder', theme: 'system' };
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
- `config.theme`：`'system'`、`'light'` 或 `'dark'`；默认 `system`，每个实例独立。
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

## Shadow DOM 与主题 Tokens

宿主样式不能穿透 WC 的 shadow root，WC 样式也不会污染宿主。需要品牌化时，只在 `<balance-component-app>` host 上覆写以下稳定 custom properties，不应依赖 `.tb-*`、Bootstrap class 或 Angular 生成属性：

- `--balance-color-accent`、`--balance-color-accent-strong`
- `--balance-color-page`、`--balance-color-surface`
- `--balance-color-text`、`--balance-color-muted`、`--balance-color-border`
- `--balance-color-overlay`
- `--balance-font-sans`、`--balance-font-mono`
- `--balance-radius`、`--balance-space`

```css
balance-component-app {
  --balance-color-accent: #0057b8;
  --balance-color-surface: #fff;
  --balance-radius: 6px;
}
```

Dialog/overlay 保持在 shadow root 内，fixed overlay 仍以 viewport 定位。宿主不要在 WC 祖先设置会改变 fixed containing block 的 `transform`、`filter` 或强制 clipping；键盘和 pointer 原生事件继续使用浏览器的 composed event 语义。

## 边界与运行前提

- Web Component 不提供 Router，也不改变宿主 URL。
- 业务视图继续调用既有相对 HTTP 路径：`/api/*` 与 `/balance-component/*`。宿主环境必须把这些路径转发到现有 Backend Orchestrator 与 Balance Microservice。
- Phase 3 使用原生 Shadow DOM；Bootstrap 与 `src/styles.scss` 仍作为独立 `styles.css` 交付，但由 WC 内部加载，不进入宿主全局 cascade。
- Angular 应用与 Web Component 共用相同的 DI/Formly provider 定义，但只有应用模式额外安装 Router provider。

# Framework adapters (Phase 4)

The canonical API remains the native `<balance-component-app>` element. Thin adapters live under
`src/adapters`: Angular provides a standalone component; React uses
`createBalanceComponentReactAdapter(React)`; Vue uses `createBalanceComponentVueBinding()` and
configures `compilerOptions.isCustomElement` with the exported
`balanceComponentVueCompilerOptions.isCustomElement`. React and Vue runtimes are supplied by the
host and are not included in the core WC bundle.

All adapters assign `config` as a DOM property, forward `navigate()` and `refresh()` Promises, and
remove their instance-owned Custom Event listeners during unmount.
