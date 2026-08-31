# Shadow DOM、主題與 CSS Tokens

WC 使用原生 Shadow DOM。Bootstrap、global SCSS 與 lazy Angular component styles 位於各自
shadow root，不污染宿主；宿主 selector 也不能穿透 WC。

宿主只可在 `<balance-component-app>` 上覆寫：

```css
balance-component-app {
  --balance-color-accent: #0057b8;
  --balance-color-accent-strong: #003f85;
  --balance-color-page: #f5f7fa;
  --balance-color-surface: #fff;
  --balance-color-text: #17212b;
  --balance-color-muted: #66717e;
  --balance-color-border: #ccd4dc;
  --balance-color-overlay: rgb(0 0 0 / 45%);
  --balance-font-sans: system-ui, sans-serif;
  --balance-font-mono: ui-monospace, monospace;
  --balance-radius: 6px;
}
```

`.tb-*`、Bootstrap classes、Angular attributes 與 shadow-tree DOM 都是私有實作。`theme` 可為
`system`、`light`、`dark`，每個 instance 獨立，不寫入 `document.documentElement`。

WC 祖先若使用 `transform`、`filter`、`contain` 或 clipping，可能改變 fixed overlay positioning。
宿主不得移除鍵盤 focus indicator或破壞 tab order。
