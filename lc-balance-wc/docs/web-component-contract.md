# Web Component 公開契約參考

權威 TypeScript 來源為
[`balance-component-element.contract.ts`](../src/app/web-component/balance-component-element.contract.ts)。

```ts
interface BalanceComponentConfig {
  version: '1';
  initialView?: 'transaction-builder' | 'business-cases';
  theme?: 'system' | 'light' | 'dark';
}
```

設定必須透過 property 傳入。預設 view 為 `transaction-builder`，theme 為 `system`。

| 方法                            | 成功                        | 失敗                         |
| ------------------------------- | --------------------------- | ---------------------------- |
| `navigate(view): Promise<void>` | view 完成掛載後 resolve     | reject並發出 `balance-error` |
| `refresh(): Promise<void>`      | current view 重建後 resolve | reject並發出 `balance-error` |

| Event                | `detail`                              |
| -------------------- | ------------------------------------- |
| `balance-ready`      | `{ version, view }`                   |
| `balance-navigation` | `{ from, to }`                        |
| `balance-refresh`    | `{ view }`                            |
| `balance-error`      | `{ code, message, operation, view? }` |

穩定錯誤碼：`INVALID_CONFIG_VERSION`、`INVALID_CONFIG`、`INVALID_VIEW`、`VIEW_LOAD_FAILED`、
`STYLESHEET_LOAD_FAILED`、`ELEMENT_NOT_CONNECTED`。請判斷 `code`，不要解析可讀 `message`。

公開方法只可在 element connected 後呼叫。事件從 Custom Element host 派發；不得依賴 shadow tree
私有事件或 DOM 結構。
