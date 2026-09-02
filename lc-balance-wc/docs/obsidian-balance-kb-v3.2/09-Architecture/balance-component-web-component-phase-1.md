---
knowledge_id: Balance-Component-Web-Component-Phase-1
title: "Balance Component Web Component Phase 1"
domain: Balance
category: Architecture
snapshot_date: 2026-08-31
tags:
  - balance
  - angular-elements
  - web-component
---

# Balance Component Web Component Phase 1

**证据状态：CONFIRMED（代码、测试与生产构建验证）**

`src/web-component.ts` 使用 Angular Elements 注册 `<balance-component-app>`。该入口只加载 `shared-app.providers.ts` 的 HTTP／Formly providers，不加载 `provideRouter()`；因此宿主的 URL 与 Router 状态不属于该组件的责任范围。

`BalanceComponentElementComponent` 以內部 `BalanceComponentView` 狀態切換 Balance Account Number、Transaction Builder 與 Business Case Runner，並按需載入三個 standalone 元件。業務規則、API service 與請求契約仍由原元件／服務負責，沒有複製到整合殼層。2026-09-02 新增的 Balance Account Number view 直接使用微服務維護 API，詳見 [[Balance-Account-Number-Maintenance-API]]。

公开边界由 `balance-component-element.contract.ts` 定义：版本 `'1'`、可选初始视图，以及 `balance-ready`、`balance-navigation`、`balance-error` 三个 DOM 事件。配置归一化和标签注册均有独立测试。

Phase 1 當時不影響 HTTP endpoint；2026-09-02 後續維護功能已新增 Microservice OAS v1.45.0 的 mapping GET/PUT，並將科目快照欄位同步到兩份 OAS。

参见：[[Architecture Concepts Index]]、[[Balance Architecture]]、`docs/web-component.md`。
