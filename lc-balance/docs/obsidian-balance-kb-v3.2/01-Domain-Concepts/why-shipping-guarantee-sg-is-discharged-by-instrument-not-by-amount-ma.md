---
knowledge_id: why-shipping-guarantee-sg-is-discharged-by-instrument-not-by-amount-ma
title: "为何船公司保函（SG）应以票据本身而非金额匹配的方式解除"
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

# 为何船公司保函（SG）应以票据本身而非金额匹配的方式解除

SG 的或有负债生命周期在结构上与信用证截然不同，原因在于三项特性：(1) SG 的受益人是承运人/船公司，而非出口商——这与信用证自身的付款承诺毫无关系；(2) SG 通常按上浮比例开立（常见为发票金额的 110%，用以覆盖运费/滞期费/超期使用费），且可能被拟定为金额与期限均不设上限；(3) SG 由承运人（而非银行）解除——只有退回 SG 正本、承运人出具书面放行函，或提交正本 B/L 提单，才能解除该项弥偿责任。以上三点均排除了诸如 MIN(单据金额, SG 金额) 这类金额匹配式解除方式的适用性：以举例说明（信用证 10 万，首次交单 5 万，SG 5.5 万），若采用 MIN 规则，则针对一笔 5.5 万的 SG 只会解除 5 万，在整个组合层面留下一笔持续增长、永久无法核销的 5 千余额缺口，而且其解除风险暴露的时点也是错误的——在正本 B/L 尚未交付之时，银行对承运人的责任其实仍然全额存续。CLAUDE.md 直接援引这一点作为 `TF_Balance_Component_Mapping` 规则 #1（"SG 的解除以票据本身为准，而非以金额为准"），2026-08-21 的 BA 裁定据此将 A9（SG 赎回）锁定为仅支持 Full-Redeem（全额赎回）。

## 来源证据

- `TF_Balance_Component_Spec-en.txt Forbidden transitions table: 'SG_OUTSTANDING reduced by any document-driven event — SG discharge is instrument-based. Only SG_RELEASE / SG_AMD_DEC / SG_CLAIM'`
- `TF_Contingent_Liability_Lifecycle-en.txt §4.1, §4.4: 'Every one of the three rules out an amount-matching discharge such as MIN(document, SG)'`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
</content>
