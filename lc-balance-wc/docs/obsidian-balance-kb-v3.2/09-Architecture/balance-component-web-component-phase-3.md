---
knowledge_id: Balance-Component-Web-Component-Phase-3
title: 'Balance Component Web Component Phase 3'
domain: Balance
category: Architecture
snapshot_date: 2026-08-31
tags:
  - balance
  - web-component
  - shadow-dom
  - design-tokens
---

# Balance Component Web Component Phase 3

**证据状态：CONFIRMED（代码、测试与生产构建验证）**

Phase 3 将 Angular shell 攬为原生 Shadow DOM 边界。Angular `SharedStylesHost` 自动把 lazy child component 的 Emulated styles 放入 shadow root；WC 自己从 `main.js` URL 推导同目录 `styles.css`，在 shadow 内加载 Bootstrap 与既有 global SCSS，React／Vue 宿主不再引入 Balance global CSS。

`config.theme` additive 支持 system/light/dark，contract version 仍为向后兼容的 `'1'`。每个 WC 实例只更新自身的 `data-theme`／`data-bs-theme`，不写入宿主 `<html>`，因此多实例可使用不同主题。

宿主定制只通过稳定 `--balance-*` tokens；`.tb-*`、Bootstrap class 与 Angular generated attributes 均保持私有。Dialog/overlay 留在实例 shadow root，fixed viewport positioning、focus 与 native composed keyboard/pointer events 继续由浏览器处理。

Backend、Microservice、业务规则、HTTP API 与 OAS 不受影响。

参见：[[balance-component-web-component-phase-2]]、[[Architecture Concepts Index]]、`docs/web-component.md`。
