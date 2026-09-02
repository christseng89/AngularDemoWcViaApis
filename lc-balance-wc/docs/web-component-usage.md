# Balance Web Component 使用指南

本指南供 Angular、React、Vue 與原生 JavaScript 開發者整合 Balance Component。所有宿主均使用同一個
`<balance-component-app>` Custom Element；framework adapter 只處理型別、事件與 lifecycle，不複製業務邏輯。

## 支援版本與前提

- Web Component contract：version `1`
- Angular adapter：Angular `>=20 <21`
- React adapter：React `>=18 <20`
- Vue adapter：Vue `>=3.4 <4`
- 瀏覽器須支援 Custom Elements、Shadow DOM、ES modules 與 `CustomEvent`
- 宿主須將 `/api/*` 轉送至 Backend Orchestrator，並將 `/balance-component/*` 轉送至 Balance Microservice
- 認證由宿主與 reverse proxy 負責；不要把 token 放入 element attribute

## 安裝與發布資產

```bash
npm install lc-balance-wc
```

從 repository 建置時：

```bash
npm ci
npm run release:prepare
npm run release:verify
```

部署時必須保留 `dist/balance-component-wc/browser/` 的全部檔案及相對路徑，包括 `main.js`、
`polyfills.js`、`styles.css`、shared chunks 與 lazy chunks。不要只複製 `main.js`。

### 靜態資產載入（建議）

```html
<script src="/balance/polyfills.js"></script>
<script type="module" src="/balance/main.js"></script>
```

`main.js` 會註冊 `<balance-component-app>`，並從自己的 URL 載入同目錄 `styles.css` 至 Shadow DOM。
不要將 `styles.css` 加到宿主的 global stylesheet。

使用 bundler 消費 package 時，可在應用入口載入 registration bundle：

```ts
import 'lc-balance-wc/wc';
```

## 公開契約

設定必須指定為 DOM **property**，不可序列化成 HTML attribute：

```ts
import type { BalanceComponentConfig, BalanceComponentElement } from 'lc-balance-wc/contract';

const balance = document.querySelector<BalanceComponentElement>('balance-component-app')!;
const config: BalanceComponentConfig = {
  version: '1',
  initialView: 'transaction-builder',
  theme: 'system',
};
balance.config = config;
```

| Property      | 值                                          | 預設值                  |
| ------------- | ------------------------------------------- | ----------------------- |
| `version`     | `'1'`                                       | `'1'`                   |
| `initialView` | `'balance-accounts'`、`'transaction-builder'`、`'business-cases'` | `'transaction-builder'` |
| `theme`       | `'system'`、`'light'`、`'dark'`             | `'system'`              |

公開方法只能在 element connected 後呼叫：

```ts
await balance.navigate('business-cases');
await balance.navigate('balance-accounts');
await balance.refresh();
```

- `navigate(view)`：切換內部 view，不修改宿主 Router 或 URL。
- `refresh()`：重建目前 view，不重新下載已載入的 bundle。

| Event                | `detail`                              |
| -------------------- | ------------------------------------- |
| `balance-ready`      | `{ version, view }`                   |
| `balance-navigation` | `{ from, to }`                        |
| `balance-refresh`    | `{ view }`                            |
| `balance-error`      | `{ code, message, operation, view? }` |

請依 `balance-error.detail.code` 處理錯誤，不要解析 `message`。穩定錯誤碼為
`INVALID_CONFIG_VERSION`、`INVALID_CONFIG`、`INVALID_VIEW`、`VIEW_LOAD_FAILED`、
`STYLESHEET_LOAD_FAILED` 與 `ELEMENT_NOT_CONNECTED`。

## 原生 JavaScript

```html
<balance-component-app id="balance"></balance-component-app>
<button id="open-cases" type="button">Business cases</button>

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

  document.querySelector('#open-cases').addEventListener('click', () => balance.navigate('business-cases'));
</script>
```

## Angular

在應用入口載入 WC bundle，再使用 standalone adapter：

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
    <app-balance-component-adapter #balance [config]="config" (failed)="onError($event.detail)" />
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

Adapter outputs 是 `ready`、`navigation`、`refreshed`、`failed`，payload 為 typed `CustomEvent`。
若直接使用 Custom Element，Angular component 須加入 `CUSTOM_ELEMENTS_SCHEMA`，並自行設定 `config` property。

## React

React adapter factory 接收宿主 React runtime，因此 core bundle 不會包含第二份 React：

```tsx
import 'lc-balance-wc/wc';
import React, { createRef } from 'react';
import { createBalanceComponentReactAdapter } from 'lc-balance-wc/adapters/react';
import type { BalanceComponentAdapterHandle } from 'lc-balance-wc/adapters';

const BalanceComponent = createBalanceComponentReactAdapter(React) as React.ComponentType<any>;
const balanceRef = createRef<BalanceComponentAdapterHandle>();

export function BalancePage() {
  return (
    <>
      <BalanceComponent
        ref={balanceRef}
        config={{ version: '1', initialView: 'transaction-builder', theme: 'dark' }}
        {...{ 'balance-error': (event: CustomEvent) => console.error(event.detail) }}
      />
      <button onClick={() => void balanceRef.current?.navigate('business-cases')}>Business cases</button>
    </>
  );
}
```

事件 handler props 使用原生事件名稱：`balance-ready`、`balance-navigation`、`balance-refresh`、
`balance-error`。含連字號的名稱可用 object spread 傳入。每個 instance 使用自己的 ref；不要以 global
mutable singleton 保存 element。

## Vue

先設定 Vue compiler，讓 `<balance-component-app>` 被視為 Custom Element：

```ts
// vite.config.ts
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { balanceComponentVueCompilerOptions } from 'lc-balance-wc/adapters/vue';

export default defineConfig({
  plugins: [vue({ template: { compilerOptions: balanceComponentVueCompilerOptions } })],
});
```

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
    { 'balance-error': (event) => console.error(event.detail) },
  );
});
onBeforeUnmount(() => balance.unmount());
</script>

<template>
  <balance-component-app ref="element" />
  <button type="button" @click="balance.navigate('business-cases')">Business cases</button>
</template>
```

設定或 handlers 改變時呼叫 `balance.update(config, handlers)`。每個 instance 都須有獨立 ref/binding，
並在 unmount lifecycle 清除 listeners。

## 主題與 Shadow DOM

宿主不應依賴內部 `.tb-*`、Bootstrap class、Angular generated attribute 或 shadow tree。品牌化時只
覆寫公開 CSS custom properties：

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
  --balance-font-mono: 'SFMono-Regular', Consolas, monospace;
  --balance-radius: 6px;
}
```

避免在 element 祖先設定會改變 fixed containing block 或裁切 overlay 的 `transform`、`filter` 或
強制 clipping。

## 多實例

同一頁可建立多個 elements。每個 instance 的 config、view、events 與 refresh lifecycle 獨立。事件
應在對應 element 上監聽，React/Vue unmount 或原生 element 移除時須解除宿主自行註冊的 listeners。

## 部署檢查清單

1. 完整部署 WC browser 目錄並保留相對路徑。
2. 確認 `polyfills.js` 在 `main.js` 前載入，或 bundler 正確處理 registration entry。
3. 確認 `/api/*` 與 `/balance-component/*` reverse proxy 可用。
4. 確認 CSP 允許 WC scripts、styles 與 API connections。
5. 等待 `customElements.whenDefined()` 或 `balance-ready` 後操作。
6. 監聽 `balance-error`，記錄穩定 `code` 與 `operation`。
7. 在目標 framework、瀏覽器與認證環境執行 smoke test。

## 常見問題

### Element 沒有顯示

檢查 `main.js`、lazy chunks、`styles.css` 是否均為 HTTP 200，並確認 element 已註冊：

```js
await customElements.whenDefined('balance-component-app');
console.log(customElements.get('balance-component-app'));
```

### `ELEMENT_NOT_CONNECTED`

宿主在 element 加入 DOM 前呼叫了方法。移到 Angular `AfterViewInit`、React event/effect、Vue
`onMounted`，或等待 `balance-ready`。

### API 404 或登入失敗

WC 使用相對 API paths，不接受 API base URL 或 token attribute。檢查宿主 origin 的 reverse proxy、
cookie、CORS、CSRF 與 session 設定。

### 畫面沒有樣式

確認 `styles.css` 與 `main.js` 位於同一發布目錄。不要重新命名或單獨搬移 `main.js`，因為它會依自身
URL 解析 stylesheet 位置。

## 延伸文件

- [公開契約與型別](web-component-contract.md)
- [Framework integration 摘要](framework-integrations.md)
- [Shadow DOM 與 styling](web-component-styling.md)
- [部署與 troubleshooting](web-component-operations.md)
- [測試與 release gates](web-component-testing.md)
