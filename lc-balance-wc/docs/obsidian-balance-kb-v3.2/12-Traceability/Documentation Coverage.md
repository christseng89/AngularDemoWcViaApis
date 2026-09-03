---
title: "Documentation Coverage"
type: traceability
domain: documentation
status: verified
source_of_truth: source-code
source_revision: "c7e9884"
verified_date: 2026-09-03
generated: true
aliases: []
tags: ["traceability", "coverage"]
source_files:
  - "scripts/rebuild-obsidian-kb.mjs"
  - "src/app/transaction-builder/balance-component.model.ts"
  - "microservices/balance-component/src/types.ts"
  - "backend/data/businessCases.js"
---

# Documentation Coverage

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

## Source knowledge inventory coverage

| Inventory | Covered | Total |
|---|---:|---:|
| Production source modules | 113 | 113 |
| Exported source symbols | 403 | 403 |
| Function catalog entries | 18 | 18 |
| Runtime API routes | 24 | 24 |
| Business Case Runner cases | 31 | 31 |
| Instrument type values | 10 | 10 |
| Movement status values | 4 | 4 |
| Exposure nature values | 3 | 3 |
| Tenor type values | 5 | 5 |
| Canonical cross-cutting topics | 14 | 14 |
| **Total** | **625** | **625** |

**Coverage: 100%**（required: >95%）。這個指標表示可列舉的 source knowledge inventory 均有 canonical documentation，不表示每一行 implementation 都應複製到 Obsidian。

## Canonical topic ownership

| Topic | Canonical note |
|---|---|
| Domain types | [[Domain Model]] |
| Balance derivation | [[Balance Calculation]] |
| Movement status | [[Movement Lifecycle]] |
| Earmark lifecycle | [[Earmark Rules]] |
| Accounting／exposure | [[Accounting and Exposure]] |
| Tolerance／money | [[Tolerance and Money]] |
| Maker／Checker | [[Maker Checker Lifecycle]] |
| API | [[API Reference]] |
| Persistence | [[Data Model]] |
| Layering | [[Architecture]] |
| OOP／OOD／SOLID | [[OOP OOD SOLID]] |
| Automated tests | [[Test Coverage and Business Cases]] |

其他頁只提供 context 與 Wiki link，不重新定義上述規則。Code Coverage 是另一個獨立 quality gate，見 [[Test Coverage and Business Cases]]。
