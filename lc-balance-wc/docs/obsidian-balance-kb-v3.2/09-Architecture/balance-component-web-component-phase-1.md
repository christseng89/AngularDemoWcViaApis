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

`BalanceComponentElementComponent` 以内部 `BalanceComponentView` 状态切换 Transaction Builder 与 Business Case Runner，并按需加载两个既有 standalone 组件。业务规则、API service 与请求契约仍由原组件／服务负责，没有复制到集成壳层。

公开边界由 `balance-component-element.contract.ts` 定义：版本 `'1'`、可选初始视图，以及 `balance-ready`、`balance-navigation`、`balance-error` 三个 DOM 事件。配置归一化和标签注册均有独立测试。

本次变更不影响 HTTP endpoint、request 或 response schema；`analysis/balance-component-api.yaml` 与 `analysis/balance-component-channel-api.yaml` 已复核且不修改。

参见：[[Architecture Concepts Index]]、[[Balance Architecture]]、`docs/web-component.md`。
