---
knowledge_id: art-16-f-preclusion-a-legal-event-that-fires-with-no-operator-action-a
title: "Art. 16(f) preclusion — a legal event that fires with no operator action and no message"
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

# Art. 16(f) preclusion — a legal event that fires with no operator action and no message

若银行未能在 UCP 600 规定的五个银行营业日窗口内（第 16(c)/(d) 条）发出符合规定的拒付通知，即被**排除（PRECLUDED）**主张单据不构成相符提示的权利——该不符点提示因而转为强制兑付，风险暴露也由附条件转为无条件（重新计算为 100% 覆盖的风险暴露）。文件中将此规则描述为「在分层规格中没有天然归属位置、但绝不可遗漏」的两条规则之一——它是一个系统自动产生（Src=S）的事件，必须纯粹依据日历/时钟自动触发，不需要任何人工触发。若未建置此机制，不符点提示在银行实际上已经丧失拒付法律权利之后，仍会静默地维持「附条件」状态。文件本身的 T16/T33 测试场景强调，该事件可能在期限截止的确切边界上，与操作员自身迟来的拒付通知发生竞态，且文件对此定义了明确、具确定性的判定优先顺序（以营业日边界的业务日期作为权威依据）。

## Source Evidence

- `TF_Balance_Component_Spec-en.txt preamble ("Two rules that have no natural home...") and §5.1 LC_DOC_PRECLUDED row`
- `TF_Contingent_Liability_Lifecycle-en.txt §3.4 'Preclusion — Art. 16(f)'`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
