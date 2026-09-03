---
knowledge_id: Contingent-Account-Entry-Rules
title: "或有负债科目分录规则"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - exposure
  - accounting
---

# 或有负债科目分录规则

`domain/contingentAccountEntry.ts` 针对每一个在范畴内的金融工具，为其每笔异动（movement）生成一组 Dr/Cr 分录；生成依据来自 `analysis/contingent-liability-ledger.html` 自身针对每一种情境所提供的、自成一体的 Dr/Cr 参考清单。分录只在建立当下生成**一次**，并以**不可变**方式存储——即使日后重新取得资料也绝不重新计算。这使得该会计记录成为真正的稽核凭证（audit artifact），而非即时运算出来的显示数值。

## B3 例外情形 — 可見虛帳、不外送 Accounting

`EPLC_EXAMINATION`（B3，Present Docs／提示单据）属于 `MEMO_ONLY`，但当前代码会生成具名的内部 `contingentAccountEntry`：Dr `Export Bills — Received, Under Examination (memo)`／Cr `Export Bills — Contra (memo)`。该 voucher 在建立时保存且不可变，供 Maker、Checker 与 Inquiry 显示。它不是外送 GL 指令：`BalanceService` 对所有 `exposureNature=MEMO` 的 movement 强制令 `accountEntries=null`，因此 B3 虚帐不会发送给 Accounting，也不产生 reversal。

## 复合分支（Compound-leg）显示缺陷（已修复）

每一种复合式（compound）Submit 方法（A3S 的 SG 赎回分支、B4 Usance 的承兑负债分支）原本都只保留其中「一条」关联分支的完整回应内容——服务端其实为两条关联分支都各自生成了 Dr/Cr 分录，但前端界面却在无声无息中把第二条分支的分录丢弃了。修复方式是新增两个完整的 `BalanceMovement` 回应字段（与既有的、仅含 `movementId` 的字段并存），让两条分支的分录都能送达 Account Entries（科目分录）对话框。

## 相关知识

- [[Off-Balance-Sheet Exposure]]
- [[Exposure Model]]
- [[BalanceMovement]]
- [[Maker Checker Lifecycle]]
- [[Business-Rule-Index]]
