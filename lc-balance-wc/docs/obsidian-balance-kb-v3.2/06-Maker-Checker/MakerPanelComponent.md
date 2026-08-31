---
knowledge_id: makerpanelcomponent
title: "MakerPanelComponent"
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

# MakerPanelComponent

Angular 子组件（从原本 2,923 行的 God Component 中拆分出来），负责 Maker 一侧的表单：`model`、自然键（natural key）/搜索状态、`selectedContract`/`selectedContractSnapshot`/`selectedParent`、全部选取器（catalog/parent/IB-index，通过注入的 `CatalogPickerService` 实例）、7 个字段组成的 `compoundLegs` 状态，以及 Submit 编排。对外暴露 `contextChanged`/`syncRequested`/`openAccountEntries`/`deletePendingRequested` 等 output，使父组件 `TransactionBuilderComponent` 与同级的 `CheckerPanelComponent` 能够在不使用 `@ViewChild` 的情况下作出响应。当前 1,223 行，是这个子项目中最大的文件。

## Source Evidence

- `maker-panel.component.ts:1-13 (imports)`
- `src/app/transaction-builder/maker-panel.component.ts:123-204 (class/constructor)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]

## 2026-08-26 更新——hintsPending 计数器，修复 hint-set 驱动函数的假阴性闪烁（"⚠ No eligible records"）

见 [[CatalogPickerService]] 的对应更新——该服务自身新增的 `loading` 字段只覆盖了 picker 自己的两路真正回合（contracts 请求与逐候选人 snapshot 请求）中的假阴性窗口。对于任何 eligibility 规则是 `{kind:'hintSet', ...}` 的函数（A3S/A4/A6/A7/A9/A10/A11/B3/B4/B5/B6/B7——所有拥有服务端计算的 hint-set 的函数），`reloadCatalog()`/`loadParent()` 自身的 `onLoaded` 回调还会额外发起第三路独立异步请求（`DocumentArrivalHintsService.loadXxxEligibility()`），而 `CatalogPickerService.loading` 对这一路完全不知情——hint-set 的 Map/Set 一开始是空的，所以从 `loading` 变为 false 到 hint-set 真正抵达之间的整个窗口里，`total` 读到的都是 0。

修复：本组件新增 `hintsPending` 计数器（`maker-panel.component.ts:1188`），在 `reloadCatalog()`/`loadParent()` 里全部 8 个 hint 加载调用点各自的请求开始前 `++`、结束后 `--`（`maker-panel.component.ts:523-566,672-691`）。`eligiblePickersLoading` 只在当前函数的规则本身确实是 hint-set 形状时才去查询这个计数器，因此像 A2 这样的普通函数不会被一个与自己无关的计数器卡住。

验证方式：由于竞态窗口只在真正的异步往返中存在，常规的同步测试/截图无法可靠复现——改用 `window.ng.getOwningComponent()` + 轮询的方式直接检查组件实例状态，确认 A3S 与 A7（Full Settle）在 `loading`/`hintsPending` 均未清零前，提示文案全程为 `null`，两者都清零后才显示正确的最终文案，不再出现假阴性闪烁。新增基于 `Subject` 的专门测试（`maker-panel.component.spec.ts`）。

（顺带一提：同一批次还清理了本组件自身 `.scss` 文件中经 grep 逐一验证确认死亡的选择器——view encapsulation 保证"对模板零匹配"等价于"确实死亡"，非猜测式删除——473 行，文件从 997 行降到 511 行；不影响本文档描述的组件行为本身。）

### 证据来源（本次更新）
- `src/app/transaction-builder/maker-panel.component.ts:1183-1188`（`hintsPending` 字段定义）
- `src/app/transaction-builder/maker-panel.component.ts:523-566,672-691`（8 个计数点）
- `maker-panel.component.scss`（997 → 511 行）
