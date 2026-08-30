---
knowledge_id: Balance-Architecture
title: "Balance 架构"
domain: Balance
category: Architecture
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-30
tags:
  - balance
  - architecture
---

# Balance 架构

## 三进程开发环境

Angular 应用（`ng serve`，端口 :4200）→ `backend/` Express 中台 orchestrator（:4300）→ `microservices/balance-component/` Express/TS 账本服务（:4100）。`proxy.conf.json` 将 `/api/*` 转发至 :4300、`/balance-component/*` 转发至 :4100。

## 微服务分层

`service/balanceService.ts` 是路由调用的稳定 application façade。它将 movement 建立、状态动作、release policy、compound transaction 与查询职责委派给聚焦的 service helpers，并继续复用 `domain/` 的纯规则及 `store/` repositories。详见 [[BalanceService Facade Architecture]]。

**已知限制：** 数据库层使用的是 `node:sqlite` 的 `DatabaseSync`（因缺少 C++ 工具链而无法使用 `better-sqlite3`）——即便在 WAL 模式下也会锁住整个数据库文件，因此无法真正演示按实例（per-instrument）的并发能力；已标记为生产环境上线前必须替换为具备行级锁的 PostgreSQL 的事项。

## Angular `transaction-builder/` 拆解（BAL-003）

曾经一个超过 2,900 行的“God Component”，历经多个会话被拆解为：`checker-actions.service.ts`、`maker-submit.service.ts`、`look-up-panel.service.ts`、`catalog-picker.service.ts`（+`paged-list-state.ts`）、`picker-selection.service.ts`、`document-arrival-hints.service.ts`、`inquire-events.service.ts`、真正的 Angular 子组件（`CheckerPanelComponent`、`MakerPanelComponent`、`AccountEntriesDialogComponent`、`InquireEventsComponent`、`BalanceSnapshotBoxComponent`）、一个 Strategy 模式的功能登记表（`function-strategy.ts`），以及若干纯函数模块（`function-policy.ts`、`builder-fields.ts`、`submit-rules.ts`、`eligibility-rule.ts`）。父组件 `transaction-builder.component.ts` 最终收敛至 436 行——仅作为编排/装配层（模式/功能侧选择、面板装配、Account Entries 对话框的开关状态、Checker 动作派发）——甚至已不再是该子项目中最大的文件（`maker-panel.component.ts` 才是）。

## OOD／设计模式使用情况

代码库自身历史中明确点名使用的模式：Strategy（`FunctionStrategy`/`FUNCTION_STRATEGIES`，取代了 11 处散落的布尔标志位）、Facade（`InquireEventsService`）、Decorator（`toReadOnlyFields()`）、Adapter（`InquiredEvent` 将一笔异动与其所属合约配对）、依赖反转（Dependency Inversion，`CheckerActionsService`/`PickerSelectionService` 以返回结果对象的方式工作，而非直接改变组件状态）。

## Inquire Events（读模型）的数据流

零新增 HTTP 端点——复用了最初为一个更早、已移除的面板而建的同一个 `GET .../balance-as-of` 端点。历经三次迭代：单一按需派生快照 → 最多 3 个 Balance Tab（LC/Acceptance/SG，按 tenor 门控）→ 持久化快照（`eventSnapshot`/`rootEventSnapshot`/`acceptanceEventSnapshot`/`sgEventSnapshot`），在 Create + Release 时通过同一个共享的 `assembleSnapshot()` 调用写入，避免按需计算与持久化结果之间出现漂移。

## 已知且已披露的权衡取舍（刻意未修复）

没有身份验证层；即便 Angular UI 本身已将 A9 锁定为仅支持全额赎回（Full-Redeem-only）（业务分析师已确认此范畴：仅限 UI 层，并非后端规则变更），`PARTIAL_REDEEM` movementType 与 `checkRedeemSufficiency()` 对任何直接调用 API 的一方仍然不受限制。完整、当前仍在跟踪的清单见 [[Knowledge-Gaps]]。

## 相关知识

- [[Balance Component Overview]]
- [[BalanceContract]]
- [[BalanceMovement]]
- [[Maker Checker Lifecycle]]
- [[Knowledge-Gaps]]
- [[Source-to-Knowledge-Map]]
- [[BalanceService Facade Architecture]]
- [[Transaction Index Selection Contract]]
- [[Freshness-Update-Log-2026-08-30]]
