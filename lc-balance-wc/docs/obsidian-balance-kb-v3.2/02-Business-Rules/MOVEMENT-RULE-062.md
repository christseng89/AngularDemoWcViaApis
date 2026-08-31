---
knowledge_id: MOVEMENT-RULE-062
title: "即期兑付被建模为单一的「先占用后释放」复合步骤（A3/A3S 建立 PENDING 占用，A4 完成收尾）—— 未实现『保留权利下付款』变体"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - movement
  - confirmed
---

# MOVEMENT-RULE-062 — 即期兑付被建模为单一的「先占用后释放」复合步骤（A3/A3S 建立 PENDING 占用，A4 完成收尾）—— 未实现『保留权利下付款』变体

## 状态
CONFIRMED

## 业务规则
即期兑付在 Balance Component 中被建模为：A3/A3S 建立 PENDING 占用（UTILIZE，暂无总账影响），随后由 A4 的 Checker Release 在同一动作中，既完成该笔 PENDING 变动记录的收尾，又过账信用证或有负债账户对的冲销分录。源规格自身的算例还额外区分出一条「保留权利下付款/凭担保函付款」路径，拥有其独立的账户对——该路径在 Balance Component 中目前尚未实现。

## 触发条件
Tenor = SIGHT，功能链 A3/A3S -> A4

## 结果
在 A3/A3S 阶段建立一笔 PENDING 状态的 UTILIZE 变动记录，并在 A4 阶段完成收尾/释放，恰好过账一笔 Folio-1 冲销分录；不存在「保留权利下付款」这一变体

## 示例
一笔即期信用证的单证到达（A3）会建立一笔无余额影响的 PENDING UTILIZE；A4 的 Checker Release 既批准该笔记录，又冲销信用证或有负债账户对

## 验证说明
与本轮此前已独立核实的 toEventRows()/isFinalizedSightUtilize 逻辑（UTILIZE、SIGHT 期限、拆分为建立行与收尾行）一致并互相印证——代码层面的机制与 ledger.html 的这段描述完全吻合。

## 来源证据

实现:
- `analysis/contingent-liability-ledger.html Folio 1 Release/Honour row, Notes item 3`

测试:
- （未引用直接测试证据）

## 相关知识
- [[BalanceMovement]]
- 已完成收尾的即期期限单证到达会拆分为「建立」行与「收尾」行
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
