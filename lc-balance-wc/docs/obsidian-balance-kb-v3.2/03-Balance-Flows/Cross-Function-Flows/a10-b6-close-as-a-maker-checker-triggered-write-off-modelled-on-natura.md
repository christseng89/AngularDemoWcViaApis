---
knowledge_id: a10-b6-close-as-a-maker-checker-triggered-write-off-modelled-on-natura
title: "A10/B6 Close 作为由 Maker/Checker 触发的核销，其建模参照自然到期（natural-expiry）会计处理"
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

# A10/B6 Close 作为由 Maker/Checker 触发的核销，其建模参照自然到期（natural-expiry）会计处理

Close（A10 Import LC / B6 Export Confirmed LC）会核销剩余的 Confirmed Balance，并将合约状态退休为 ContractStatus.CLOSED；根据 closeEligibility.ts 自身的文档注释，其设计明确参照了 cs-tf-balance-knowhow 论证中"到期前取消（cancellation before expiry）"的类比——采用与自然到期相同的核销会计分录，但触发方式是 Maker/Checker 操作对，而非按日期驱动的批处理作业。核销金额从不由 Maker 手动输入；它由客户端根据 Confirmed Balance 自动推导得出，且必须精确匹配。

## 证据来源

- `microservices/balance-component/src/domain/closeEligibility.ts lines 1-18`
- `microservices/balance-component/src/service/balanceService.ts lines 200-230`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
