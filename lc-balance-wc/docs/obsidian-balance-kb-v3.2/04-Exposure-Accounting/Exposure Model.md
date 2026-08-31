---
knowledge_id: Exposure-Model
title: "风险敞口模型"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - exposure
  - domain-concept
---

# 风险敞口模型

Balance Component 的范畴边界十分明确：**"Balance Component 只負責 Contingent Liability"**——它追踪的是风险敞口，而非结算／总账过账（那属于姊妹 Payment/Charge Component 的职责）。该风险敞口模型分为三层：

## 1. ExposureNature（逐笔异动分类）

`CONTINGENT | ACTUAL | MEMO` —— 见 [[BalanceMovement]]。这是最粗粒度的分类：某笔异动究竟是或有（表外）义务、真正的实际义务，还是纯粹的备忘性应收追踪（`MEMO`，即未保兑信用证的开证行义务）？

## 2. 表外与表内效果之分

在 CONTINGENT 风险敞口范畴内，[[Off-Balance-Sheet Exposure]] 决定了某一金融工具的或有风险敞口在当下*究竟*占用了多少额度（SHGT 净额处理、Present Docs 圈存净额处理）——这正是 [[Balance Derivation Rules|Tight Available Balance]] 所代表的意涵。一个法律事件（Honour/Accept、赎回）会把部分或有风险敞口转换为真正的资产（`EPLC_DUE_FROM_ISSUING_BANK` 等，见 [[InstrumentType]]），或将其彻底解除。

## 3. Dr/Cr 过账（contingentAccountEntry）

每一笔针对范畴内金融工具的异动，都会在建立当下一次性生成属于自己的 Dr/Cr 分录，并以不可变方式存储——见 [[Contingent Account Entry Rules]]。这正是风险敞口在会计上可见的凭证：一份自成一体的"或有负债分类账"参考文档（`analysis/contingent-liability-ledger.html`）记录了范畴内每一种情境所对应的预期 Dr/Cr 分录。

## 为何或有负债要以表外方式追踪

信用证／保函是银行代表客户所做出的一项*承诺*——具有真实的财务风险，但尚未发生现金流动。以表外方式追踪它（用 Confirmed／Available／Tight Available Balance 的口径表示，而不计入银行总账）让银行得以掌握自身的整体风险敞口，并强制执行充分性检查（绝不让某客户的信用证额度被过度承诺），同时又不会在义务尚未真正成形之前，就过早地把一笔实际负债入账。它只有在真正的法律事件发生时——Honour/Accept，或透过赎回／Close 解除——才会转化为真实的、表内的义务。

## 相关知识

- [[BalanceContract]]
- [[BalanceMovement]]
- [[Off-Balance-Sheet Exposure]]
- [[Contingent Account Entry Rules]]
- [[Balance Derivation Rules]]
- [[Close Eligibility]]
- [[Business-Rule-Index]]
