---
knowledge_id: sg-redemption-amount-min-bill-amount-sg-outstanding
title: "SG Redemption Amount = MIN(Bill Amount, SG Outstanding)"
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

# SG Redemption Amount = MIN(Bill Amount, SG Outstanding)

每一个与 SG 匹配的 Document Arrival（A3S）用例，都会将其自身的 SG 赎回金额计算为当时的 MIN(Document Arrival/Bill 金额, SG 自身的 Outstanding 余额)——具体可见于 import-case-4（Bill 50,000 对 SG Outstanding 100,000 -> PARTIAL_REDEEM 50,000）、import-case-6（两笔 SG，一笔金额恰好匹配 -> FULL_REDEEM，另一笔部分匹配 -> PARTIAL_REDEEM），以及 import-case-7/8（Bill 25,000 对 SG Outstanding 20,000 -> FULL_REDEEM 20,000，即便 Bill 金额更大，仍以 SG 自身的 outstanding 为上限）。

## 证据来源

- `backend/data/businessCases.js:396-412,571-618,708-737,893-923`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
