---
knowledge_id: Off-Balance-Sheet-Exposure
title: "表外风险敞口"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - exposure
  - contingent-liability
---

# 表外风险敞口

信用证的或有负债会一直以**表外**方式追踪，直到某个法律事件（真正的承兑／兑付／动用）把其中一部分转化为真实的、表内的义务为止。本系统中存在两种表外机制，两者都在 `domain/offBalanceExposure.ts` 中计算，并被净额计入 [[Balance Derivation Rules|Tight Available Balance]]：

## 装船担保（SHGT）风险敞口 — 进口侧

SG（装船担保）让买方得以在正本单据到达前先行提货；其自身的风险敞口在存续期间会*占用*母信用证的 Tight Available Balance。`checkShgtIssueSufficiency()` 同时强制执行「超过 LC 额度」检查与「超过净 SHGT 后额度」检查，两者都是硬性 ERROR（而非仅仅是警告）。过去，一笔独立的、仍处于 PENDING（尚未经 Checker 核准）状态的 SHGT 赎回，会被当作与已 RELEASED 者一样纳入净额处理，这可能导致在该赎回真正获准之前，就提前为另一笔*不相关*的第二笔提交释放出额度——现已修正为：赎回只有在真正处于 `RELEASED` 状态后才会被净额计入，**除非**该赎回与同一信用证下仍处于 PENDING 状态的某笔 UTILIZE 共享同一个 `businessEventId`（即 A3S 自身的匹配复合配对，两者永远一起被释放，或一起被自动回滚——见 [[Maker Checker Lifecycle]]）。

## Present Docs 圈存（Earmark） — 出口侧

`EPLC_EXAMINATION`（B3，Present Docs）是 `MEMO_ONLY` 圈存——依 D3 原则：只有*法律*事件才会真正变动余额。B3 会持久化供 Maker／Checker／Inquiry 显示的内部 memo `contingentAccountEntry`，但外送会计 `accountEntries` 固定为 null（见 [[Contingent Account Entry Rules]]）。`computePresentDocsEarmark()`／`computePresentDocsEarmarkApproved()` 净额处理的对象是*其他*仍处于 PENDING 状态的提示单据，而不仅仅是当下正在提交的这一笔。B3 经过重新设计后，会真正执行 RELEASE（而不只是"确认"）：`presentDocsConsumedAt` 单独追踪"已被后续的 B4 消耗"，与 `status` 所追踪的"已被 B3 自身释放"分开处理——Approved 圈存的判定基础是 `RELEASED && !presentDocsConsumedAt`。一笔仍处于 PENDING 状态、*引用*了某个已释放 B3 记录的 B4，会临时性地把该笔引用的消耗净额计入（`derivePresentDocsProvisionallyConsumedIds()`）——这是一旦 Submitted 后就自我平衡、板上钉钉的结果，而非一项独立风险——同时 B3 自身的新提示单据检查、以及 B2 自身的 AMEND_DECREASE 检查都始终保持严格，绝不会因为另一笔交易的临时净额处理而放宽（"增加從嚴，對 LC Balance 而言"）。

## Close 冲销

A10（进口）／B6（出口）Close（`domain/closeEligibility.ts`）是表外风险敞口的终结事件：一旦 SG Balance = 0、Acceptance Balance = 0，且整个合约树中不存在任何未结的 Event，剩余的 Confirmed Balance 就会被精确冲销（在 Submit 与 Release 两个阶段都会重新验证），合约随之终止为 `CLOSED`。见 [[Close Eligibility]]。

## 相关知识

- [[Balance Derivation Rules]]
- [[Contingent Account Entry Rules]]
- [[Tolerance Processing]]
- [[Close Eligibility]]
- [[Maker Checker Lifecycle]]
- [[Business-Rule-Index]]
