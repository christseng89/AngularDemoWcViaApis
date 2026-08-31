---
knowledge_id: MAKER-CHECKER-RULE-031
title: "复核人 release() 依复合提交形态，分派至四条分腿放行链其中之一"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - maker-checker
  - confirmed
---

# MAKER-CHECKER-RULE-031 — 复核人 release() 依复合提交形态，分派至四条分腿放行链其中之一

## 状态
CONFIRMED

## 业务规则
release()（checker-actions.service.ts）会依所选功能的 FunctionStrategy，分派至四条链之一：settlesDocumentArrival（A6/B4）先放行来源，再放行主分腿（后续再放行下游）；documentArrivalWithSg（A3S）放行 SG 赎回后再确认（从不放行）来源；amountVsAvailableDerivation==='SETTLE'（B5）先放行主分腿，再放行配对的偿付应收款；其余所有功能则执行单纯的一次放行。

## 条件
deriveFunctionStrategy(ctx.selectedFunction).checkerRelease.settlesDocumentArrival ｜ .compoundSubmission.possibleShapes 包含 'documentArrivalWithSg' ｜ .movementDerivation.amountVsAvailableDerivation === 'SETTLE' ｜ 以上皆非。

## 结果
详见 businessRule 中所述的四条不同放行链，及其各自的结果种类（'released' 相对于 'documentArrivalAcknowledged'）。

## 示例
B4 Usance ACCEPT：先放行 accept 分腿，再放行承兑负债分腿，最后放行偿付应收款分腿——总共调用 3 次 api.release()，且不会重复放行已经放行过的 B3 来源。

## 验证说明
已直接重新阅读 checker-actions.service.ts:49-128，确认其所描述的 checkerId 推导方式与四条放行链完全一致（在调查另一项发现时，也一并验证了第 50 行 checkerId := ctx.createdBy==='maker1'?'checker1':'checker2' 的写法）。已确认。

## 来源证据

实现：
- `src/app/transaction-builder/checker-actions.service.ts:49-128`

测试：
- `src/app/transaction-builder/checker-actions.service.spec.ts:62-407`

## 相关知识
- [[Maker Checker Lifecycle]]
- 依复合提交形态而定的复核人操作路由
- checkerAct() 操作分派决策表（元件层级，属于不同层次）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
