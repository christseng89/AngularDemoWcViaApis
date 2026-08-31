---
knowledge_id: themeservice-appcomponent-theme-toggle
title: "ThemeService / AppComponent 主题切换"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# ThemeService / AppComponent 主题切换

一个应用全局的 `providedIn:'root'` 服务，负责将 System/Light/Dark 三种模式解析为 `<html>` 上的 `data-theme`/`data-bs-theme` 属性，并持久化到 localStorage，只有在 System 模式下才会持续追踪 `matchMedia` 的实时变化。刻意与所有 A1-A9/B1-B5 业务代码保持独立——这是纯粹的框架/界面层关注点，并非业务关键功能。AppComponent 的图标切换按钮通过 `cycleMode()` 依次在 System→Light→Dark→System 之间步进。

## Source Evidence

- `app.component.ts:1-58`
- `theme.service.ts:1-123`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
