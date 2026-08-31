# Angular、React 與 Vue 整合

所有 adapter 都以 `./contract` 的 version 1 型別為權威來源，設定 `config` property、轉接
`navigate()`／`refresh()` Promise，並在 unmount 時移除自身事件 listener。

## Angular

```ts
import { Component, ViewChild } from '@angular/core';
import { BalanceComponentAdapterComponent } from 'lc-balance-wc/adapters/angular';

@Component({
  standalone: true,
  imports: [BalanceComponentAdapterComponent],
  template: `<app-balance-component-adapter #balance [config]="config" />`,
})
export class HostComponent {
  readonly config = { version: '1' as const, theme: 'system' as const };
  @ViewChild('balance') balance!: BalanceComponentAdapterComponent;
  openCases(): Promise<void> {
    return this.balance.navigate('business-cases');
  }
}
```

Outputs 為 `ready`、`navigation`、`refreshed`、`failed`，detail 型別分別對應四個公開 Custom Events。

## React

```tsx
import React, { createRef } from 'react';
import { createBalanceComponentReactAdapter } from 'lc-balance-wc/adapters/react';
import type { BalanceComponentAdapterHandle } from 'lc-balance-wc/adapters';

const BalanceComponent = createBalanceComponentReactAdapter(React);
const balance = createRef<BalanceComponentAdapterHandle>();
const view = <BalanceComponent ref={balance} config={{ version: '1', theme: 'dark' }} />;
await balance.current?.refresh();
```

工廠接收宿主 React runtime，因此 core WC 不 bundle React。每個 instance 持有自己的 DOM reference。

## Vue

Vue compiler 必須使用 exported predicate 辨識 Custom Element：

```ts
import { balanceComponentVueCompilerOptions } from 'lc-balance-wc/adapters/vue';
// vite vue plugin: template.compilerOptions.isCustomElement =
// balanceComponentVueCompilerOptions.isCustomElement
```

```ts
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { createBalanceComponentVueBinding } from 'lc-balance-wc/adapters/vue';

const element = ref<HTMLElement>();
const balance = createBalanceComponentVueBinding();
onMounted(() => balance.mount(element.value as never, { version: '1', theme: 'light' }));
onBeforeUnmount(() => balance.unmount());
```

多實例必須保留獨立 ref／binding；不可把事件轉送到全域 mutable singleton。
