---
knowledge_id: a4-maker-submit-applicability-by-tenor-import-document-arrival-utilize
title: "A4 Maker-Submit 按期限的适用性（进口单据到达／UTILIZE 用例）"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# A4 Maker-Submit 按期限的适用性（进口单据到达／UTILIZE 用例）

| 用例 | 期限 | 是否存在 makerSubmit 步骤？ | 终结机制 |
|---|---|---|---|
| import-case-1 | SIGHT（即期） | 是 | A4（createMovement -> makerSubmit -> release） |
| import-case-2 | BUYERS_USANCE（买方远期） | 否 | A6 复合放行（先放行单据到达，再放行承兑 CREATE） |
| import-case-3 | SIGHT（即期） | 是 | A4 |
| import-case-4 | SIGHT（即期） | 是 | A4 |
| import-case-6 | SIGHT（即期） | 是（3 次，每次单据到达各一次） | A4 |
| import-case-7 / 8 | SELLERS_USANCE（卖方远期） | 否 | A6 复合放行 |
| import-case-9 | BUYERS_USANCE（买方远期） | 否 | A6 复合放行 |
| import-case-10 | SIGHT（即期） | 是 | A4 |

## 来源证据

- `backend/data/businessCases.js:70-137,139-228,326-446,503-651,653-830,1029-1135,1137-1227`

## 相关知识

- Business Case Registry (backend orchestrator) + Business Case Runner UI
- [[Business-Rule-Index]]
