# Balance Web Component 使用指南

本指南供 Angular、React、Vue 與原生 JavaScript 開發者整合 Balance Component。所有宿主都使用同一個
`<balance-component-app>` Custom Element；framework adapter 只處理型別、事件與 lifecycle，不複製業務邏輯。

## 1. 支援版本與執行前提

- Web Component contract：version `1`
- Angular adapter：Angular `>=20 <21`
- React adapter：React `>=18 <20`
- Vue adapter：Vue `>=3.4 <4`
- 瀏覽器必須支援 Custom Elements、Shadow DOM、ES modules 與 `CustomEvent`
- 宿主必須把 `/api/*` 轉送至 Backend Orchestrator，並把 `/balance-component/*` 轉送至 Balance Microservice
- 認證由宿主與 reverse proxy 負責；不要把 token 放在 element attribute

## 2. 安裝與建立發布產物

從 package registry 安裝時：

```bash
npm install lc-balance-wc
```

從本 repository 建置時：

```bash
npm ci
npm run release:prepare
npm run release:verify
```

發布或部署時，必須保留 `dist/balance-component-wc/browser/` 內所有檔案及相對路徑，包括
`main.js`、`polyfills.js`、`styles.css`、shared chunks 與 lazy chunks。不要只複製 `main.js`。

## 3. 載入 Web Component

### 靜態資產方式（建議）

將完整 browser 目錄部署到 `/balance/`：

```html
<script src="/balance/polyfills.js"></script>
<script type="module" src="/balance/main.js"></script>
```

`main.js` 會註冊 `<balance-component-app>`，並從自己的 URL 找到同目錄的 `styles.css`。不要把
`styles.css` 加到宿主的 global stylesheet；它會載入 Web Component 的 Shadow DOM。

若 bundler 直接消費 npm package，可在應用入口載入 registration bundle：

```ts
import 'lc-balance-wc/wc';
```

不論採用哪種方式，都應在 element 已註冊且連接到 DOM 後才呼叫公開方法。

## 4. 公開設定、方法與事件

設定必須指定為 DOM **property**，不可寫成序列化的 HTML attribute：

```ts
import type { BalanceComponentConfig, BalanceComponentElement } from 'lc-balance-wc/contract';

const balance = document.querySelector<BalanceComponentElement>('balance-component-app');
const config: BalanceComponentConfig = {
  version: '1',
  initialView: 'transaction-builder',
  theme: 'system',
};
balance!.config = config;
```

可用設定：

| Property | 值 | 預設值 |
| --- | --- | --- |
| `version` | `'1'` | `'1'` |
| `initialView` | `'transaction-builder'`、`'business-cases'` | `'transaction-builder'` |
| `theme` | `'system'`、`'light'`、`'dark'` | `'system'` |

公開方法：

```ts
await balance!.navigate('business-cases');
await balance!.refresh();
```

- `navigate(view)`：切換內部 view，不修改宿主 Router 或 URL。
- `refresh()`：重建目前 view，不重新下載已載入的 bundle。
- 兩個方法都回傳 `Promise<void>`，而且只能在 element connected 後呼叫。

公開事件：

| Event | `detail` |
| --- | --- |
| `balance-ready` | `{ version, view }` |
| `balance-navigation` | `{ from, to }` |
| `balance-refresh` | `{ view }` |
| `balance-error` | `{ code, message, operation, view? }` |

請依 `balance-error.detail.code` 處理錯誤，不要解析可讀的 `message`。穩定錯誤碼為
`INVALID_CONFIG_VERSION`、`INVALID_CONFIG`、`INVALID_VIEW`、`VIEW_LOAD_FAILED`、
`STYLESHEET_LOAD_FAILED` 與 `ELEMENT_NOT_CONNECTED`。

## 5. 原生 JavaScript 範例

```html
<balance-component-app id="balance"></balance-component-app>

<script type="module">
  await customElements.whenDefined('balance-component-app');
  const balance = document.querySelector('#balance');

  balance.config = {
    version: '1',
    initialView: 'transaction-builder',
    theme: 'system',
  };

  balance.addEventListener('balance-ready', ({ detail }) => console.log('ready', detail));
  balance.addEventListener('balance-navigation', ({ detail }) => console.log('navigation', detail));
  balance.addEventListener('balance-refresh', ({ detail }) => console.log('refresh', detail));
  balance.addEventListener('balance-error', ({ detail }) => console.error(detail.code, detail));

  document.querySelector('#open-cases').addEventListener('click', () =>
    balance.navigate('business-cases'),
  );
</script>
```

## 6. Angular 使用方式

在應用入口載入 WC bundle，然後使用 standalone adapter：

```ts
import 'lc-balance-wc/wc';
import { Component, ViewChild } from '@angular/core';
import { BalanceComponentAdapterComponent } from 'lc-balance-wc/adapters/angular';
import type { BalanceComponentConfig, BalanceErrorDetail } from 'lc-balance-wc/contract';

@Component({
  selector: 'app-balance-page',
  standalone: true,
  imports: [BalanceComponentAdapterComponent],
  template: `
    <app-balance-component-adapter
      #balance
      [config]="config"
      (failed)="onError($event.detail)"
    />
    <button type="button" (click)="openCases()">Business cases</button>
  `,
})
export class BalancePageComponent {
  @ViewChild('balance') private balance!: BalanceComponentAdapterComponent;

  readonly config: BalanceComponentConfig = {
    version: '1',
    initialView: 'transaction-builder',
    theme: 'system',
  };

  openCases(): Promise<void> {
    return this.balance.navigate('business-cases');
  }

  onError(detail: BalanceErrorDetail): void {
    console.error(detail.code, detail);
  }
}
```

Adapter outputs 為 `ready`、`navigation`、`refreshed` 與 `failed`，其 payload 是原始 typed
`CustomEvent`。若不使用 adapter，宿主 component 必須加入 `CUSTOM_ELEMENTS_SCHEMA`，並自行把 `config`
設定到 native element property。

## 7. React 使用方式

React adapter factory 接收宿主 React runtime，因此 WC core 不會 bundle 第二份 React：

```tsx
import 'lc-balance-wc/wc';
import React, { createRef } from 'react';
import { createBalanceComponentReactAdapter } from 'lc-balance-wc/adapters/react';
import type { BalanceComponentAdapterHandle } from 'lc-balance-wc/adapters';

const BalanceComponent = createBalanceComponentReactAdapter(React) as React.ForwardRefExoticComponent<
  React.PropsWithoutRef<{
    config: { version: '1'; initialView?: 'transaction-builder' | 'business-cases'; theme?: 'system' | 'light' | 'dark' };
    onError?: (event: CustomEvent) => void;
  }> & React.RefAttributes<BalanceComponentAdapterHandle>
>;

const balanceRef = createRef<BalanceComponentAdapterHandle>();

export function BalancePage() {
  return (
    <>
      <BalanceComponent
        ref={balanceRef}
        config={{ version: '1', initialView: 'transaction-builder', theme: 'dark' }}
        onError={(event) => console.error(event.detail)}
      />
      <button onClick={() => void balanceRef.current?.navigate('business-cases')}>
        Business cases
      </button>
    </>
  );
}
```

事件 handler 名稱由 adapter 定義為 `onReady`、`onNavigation`、`onRefresh`、`onError`。每個 instance
使用自己的 ref，不要用 global mutable singleton 保存 element。

## 8. Vue 使用方式

先告訴 Vue compiler 不要把 `<balance-component-app>` 當成 Vue component。Vite 範例：

```ts
// vite.config.ts
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { balanceComponentVueCompilerOptions } from 'lc-balance-wc/adapters/vue';

export default defineConfig({
  plugins: [
    vue({
      template: { compilerOptions: balanceComponentVueCompilerOptions },
    }),
  ],
});
```

Vue component：

```vue
<script setup lang="ts">
import 'lc-balance-wc/wc';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { createBalanceComponentVueBinding } from 'lc-balance-wc/adapters/vue';
import type { BalanceComponentElement } from 'lc-balance-wc/contract';

const element = ref<BalanceComponentElement>();
const balance = createBalanceComponentVueBinding();

onMounted(() => {
  balance.mount(
    element.value!,
    { version: '1', initialView: 'transaction-builder', theme: 'light' },
    { onError: (event) => console.error(event.detail) },
  );
});

onBeforeUnmount(() => balance.unmount());
</script>

<template>
  <balance-component-app ref="element" />
  <button type="button" @click="balance.navigate('business-cases')">Business cases</button>
</template>
```

設定或 handlers 改變時呼叫 `balance.update(config, handlers)`。每個 element instance 都要有獨立的
ref 與 binding，並在 unmount lifecycle 清除 listeners。

## 9. 主題與樣式

Web Component 使用 Shadow DOM。宿主 CSS 不應依賴內部 `.tb-*`、Bootstrap class、Angular generated
attribute 或 shadow tree 結構。品牌化時只覆寫公開 CSS custom properties：

```css
balance-component-app {
  --balance-color-accent: #0057b8;
  --balance-color-accent-strong: #003f86;
  --balance-color-page: #f5f7fa;
  --balance-color-surface: #ffffff;
  --balance-color-text: #172033;
  --balance-color-muted: #61708a;
  --balance-color-border: #ccd5e2;
  --balance-font-sans: Inter, system-ui, sans-serif;
  --balance-font-mono: "SFMono-Regular", Consolas, monospace;
  --balance-radius: 6px;
}
```

避免在 element 祖先設定會改變 fixed containing block 或裁切 overlay 的 `transform`、`filter` 或
強制 clipping。

## 10. 多實例與 lifecycle

同一頁可建立多個 Balance elements。每個 instance 的 config、view、events 與 refresh lifecycle 互相
獨立。請在各 element 上監聽事件，並在 React/Vue unmount 或原生 element 移除時解除宿主自行註冊的
listeners。

## 11. 部署檢查清單

1. 完整部署 WC browser 目錄，保留檔名與相對路徑。
2. 確認 `polyfills.js` 在 `main.js` 前載入，或由 bundler 正確處理 registration entry。
3. 確認 `/api/*` 與 `/balance-component/*` reverse proxy 可用。
4. 確認 CSP 允許 WC scripts、styles 與所需 API connections。
5. 等待 `customElements.whenDefined()` 或 `balance-ready` 後執行操作。
6. 監聽 `balance-error` 並記錄穩定的 `code` 與 `operation`。
7. 在目標 framework、瀏覽器與認證環境執行 smoke test。

## 12. 常見問題

### Element 沒有顯示

檢查 `main.js`、lazy chunks 及 `styles.css` 是否均能以 HTTP 200 載入，並確認 element 已成功註冊：

```js
await customElements.whenDefined('balance-component-app');
console.log(customElements.get('balance-component-app'));
```

### `ELEMENT_NOT_CONNECTED`

宿主在 element 尚未加入 DOM 前呼叫了 `navigate()` 或 `refresh()`。移到 Angular
`AfterViewInit`、React effect/event handler、Vue `onMounted`，或等待 `balance-ready`。

### API request 404 或登入失敗

Web Component 使用既有相對 API paths，不接受 API base URL 或 token attribute。檢查宿主 origin 的
reverse proxy、cookie、CORS、CSRF 與 session 設定。

### 畫面沒有套用樣式

確認 `styles.css` 與 `main.js` 位於同一發布目錄。不要重新命名或單獨搬移 `main.js`；它會依自身 URL
解析 stylesheet 位置。

## 延伸文件

- [公開契約與型別](web-component-contract.md)
- [Framework integration 摘要](framework-integrations.md)
- [Shadow DOM 與 styling](web-component-styling.md)
- [部署與 troubleshooting](web-component-operations.md)
- [測試與 release gates](web-component-testing.md)

