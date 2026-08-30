---
knowledge_id: MAKER-CHECKER-RULE-062
title: "Checker 独立 LC-only 搜索候选现与 Checker Queue 共享同一 isCheckerActionable() 判断——已 earmarked 的候选不再被列出"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-26
tags:
  - balance
  - maker-checker
  - confirmed
---

# MAKER-CHECKER-RULE-062 — Checker 独立 LC-only 搜索候选现与 Checker Queue 共享同一 isCheckerActionable() 判断——已 earmarked 的候选不再被列出

## Status
CONFIRMED

## Business Rule
业务于 2026-08-24 报告一个真实缺口（"B3/A3/A3S 單獨使用 Checker，已經 earmarked 的交易不應該再被選出"）：`checker-panel.component.ts` 的 `searchCheckerCandidatesByLcOnly()`（Checker 只输入 LC Number、次要键——IB/SG Number——留空时触发的候选搜索，适用于 A6/A7/A8/A9/B4/B5 等任何拥有 `checkerSecondaryField` 的功能；A3/A3S 因自身自然键仅为 LC Number 本身，从不会走到这条路径）此前只检查 `catalog()` 返回的候选合约自身是否 `status: 'ACTIVE'`——这是合约层级的字段，与该候选名下的动帳（movement）是否仍有东西留给这次 Checker 操作完全是两回事。一个候选即使自身仍 `ACTIVE`，其名下唯一相关的动帳也完全可能早已被 Checker Release 过（即已 earmarked），此时对本次 Checker 操作而言已无事可做——但旧版逻辑仍会把它列入候选清单，Checker 选中后进入 Checker Queue，才发现空空如也，构成一个死路。

修复方式：把 `loadCheckerQueue()` 自身原本内嵌的 EARMARKING/EARMARKED 过滤逻辑（[[earmarking-vs-earmarked-checker-queue-filter-split]]）抽取为独立的私有方法 `isCheckerActionable(movement, selectedFunction)`；`searchCheckerCandidatesByLcOnly()` 现在对 `catalog()` 返回的每个 ACTIVE 候选，额外调用 `listMovements()` 取得其名下全部动帳，并用同一个 `isCheckerActionable()` 判断式过滤，只保留至少有一笔真正可操作动帳的候选——因此候选清单与其后加载的 Checker Queue，对"何为可操作"的判断永远一致，不可能出现候选可选、队列却空的情形。某个候选自身的 `listMovements()` 调用失败时，视为"该候选不可操作"（`catchError(() => of(null))`），而非让整次搜索失败。

## Conditions
`selectedFunction.checkerSecondaryField` 存在（该功能的自然键需要 IB/SG Number 作为次要键——A6/A7/A8/A9/B4/B5 等），且 Checker 输入了 LC Number 但将次要键留空，触发 `searchCheckerCandidatesByLcOnly()`。A3/A3S 自然键仅为 LC Number，`checkerSecondaryField` 为空，从不触发此路径。

## Result
0 个可操作候选 → `checkerSearchError`（"No {次要键 Label} record with an actionable PENDING item found under this LC."）；恰好 1 个 → 自动解析（`checkerAutoPickedHint`）并直接加载 Checker Queue；多于 1 个 → 展示 `checkerSecondaryCandidates` 供人工挑选。已经 earmarked（无可操作动帳）的候选，无论 catalog 层级状态是否仍为 ACTIVE，均不会计入以上任何一个分支的候选集合。

## Example
LC0009 之下有两个 SHGT 子合约 SG-A、SG-B，均为 `ACTIVE`；SG-A 的 A9 全额赎回已被 Checker Release（已 earmarked，无可操作动帳），SG-B 的 A9 全额赎回仍 PENDING 待 Checker 处理。Checker 只输入 LC0009、将 SG Number 留空发起搜索 → 只有 SG-B 出现在候选/自动解析结果中，SG-A 不再出现（修正前 SG-A 与 SG-B 都会出现，选中 SG-A 后 Checker Queue 为空）。若 LC0009 之下所有候选均已 earmarked，则报错"No SG Number record with an actionable PENDING item found under this LC."，而非误导性地展示一个全部不可操作的选择列表。

## Verification Note
已直接阅读 `checker-panel.component.ts` 第 139-262 行（`searchCheckerLc()` 文档注释与实现、`searchCheckerCandidatesByLcOnly()` 完整实现，含其自身 2026-08-24 缺口的文档注释）与第 265-337 行（`loadCheckerQueue()` 现行版本调用抽取后的 `isCheckerActionable()`；`isCheckerActionable()` 本身完整实现）。对应单元测试 `checker-panel.component.spec.ts` 第 366-477 行覆盖：零候选报错、单候选自动解析、多候选人工挑选、已 earmarked 候选被排除（第 422-453 行）、全部候选皆已 earmarked 时报出与零候选相同的错误而非误导性的挑选列表（第 454-467 行）。CONFIRMED。

## Source Evidence

实现:
- `src/app/transaction-builder/checker-panel.component.ts:139-262`
- `src/app/transaction-builder/checker-panel.component.ts:265-337`

测试:
- `src/app/transaction-builder/checker-panel.component.spec.ts:366-477`

## Related Knowledge
- [[earmarking-vs-earmarked-checker-queue-filter-split]] —— 本规则复用的 `isCheckerActionable()` 判断式原始定义（EARMARKING/EARMARKED 方向性split）
- [[checker-s-own-independent-search-auto-resolve-when-the-secondary-key-i]] —— 本规则收紧的候选搜索流程本身
- [[checker-independent-search-auto-resolve-by-candidate-count]] —— 同一流程的 Mermaid 图示
- [[Maker Checker Lifecycle]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
