---
knowledge_id: export-role-determines-exposure-bank-role-not-export-lc-drives-whether
title: "出口角色决定风险暴露——是 bank_role 而非'出口信用证'本身决定或有负债是否存在"
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

# 出口角色决定风险暴露——是 bank_role 而非'出口信用证'本身决定或有负债是否存在

同一笔出口信用证可以使本行处于五种不同角色（通知行 Advising / 被指定但未行使 Nominated-not-acting / 被指定并议付（未保兑）Nominated-negotiating(unconfirmed) / 保兑行 Confirming / 沉默保兑 Silent confirmer / 偿付行 Reimbursing），每种角色对应完全不同的或有负债/资产/义务人组合。仅作通知（Advising）完全不产生任何或有负债——若系统在通知环节就入账，会以全部通知量虚增表外账簿，而对大多数银行而言，通知量远远大于保兑量。或有负债绝不能以 SWIFT 49 栏位为触发依据（该栏位只携带开证行的指示——CONFIRM/MAY ADD/WITHOUT——并不能说明本行是否真的加具了保兑）；它必须以"向受益人实际通知保兑"这一操作行为作为触发点。这正是实际系统中 EPLC_LC 侧票据与 EPLC_CONFIRMATION 之间义务人/风险暴露分离设计的理论依据，也是为何存在"MEMO"ExposureNature（未保兑信用证项下开证行侧义务，仅作应收款追踪，见 CLAUDE.md）的原因。

## 来源证据

- `TF_Balance_Component_Spec-en.txt I11: 'CNF_ADD fires only on the act of advising the confirmation — never off field 49'`
- `TF_Contingent_Liability_Lifecycle-en.txt §6: role table + 'Do not key the contingent off field 49...Trigger on the operational act of advising'`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
</content>
