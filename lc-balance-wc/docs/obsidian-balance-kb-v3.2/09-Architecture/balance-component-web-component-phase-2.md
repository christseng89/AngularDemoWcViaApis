---
knowledge_id: Balance-Component-Web-Component-Phase-2
title: "Balance Component Web Component Phase 2"
domain: Balance
category: Architecture
snapshot_date: 2026-08-31
tags:
  - balance
  - angular-elements
  - web-component
  - cross-framework
---

# Balance Component Web Component Phase 2

**证据状态：CONFIRMED（代码、测试与生产构建验证）**

Phase 2 只完善 Angular UI 的跨框架边界。`<balance-component-app>` 公开 `navigate(view)` 与 `refresh()` Promise 方法，并派发 `balance-ready`、`balance-navigation`、`balance-refresh`、`balance-error`。Vue／React 宿主只需持有 DOM element reference，不需要引用 Angular 类型或 Router。

Angular shell 使用自己的 `ViewContainerRef` 管理 lazy-loaded Transaction Builder／Business Case Runner。refresh 销毁并重建当前 view，但不会重新下载已经加载的 bundle；加载失败时 Promise reject、派发错误事件，并保留最后可用 view。

每个元素实例具有独立的 view state、render lifecycle 与事件来源。Phase 2 不新增认证、token、header、API base URL 或全局可变 store，也不修改 Backend、Microservice、Balance 业务规则或 OAS。

参见：[[balance-component-web-component-phase-1]]、[[Architecture Concepts Index]]、`docs/web-component.md`。
