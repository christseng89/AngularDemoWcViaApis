---
title: "Traceability Matrix"
type: traceability
domain: documentation
status: verified
source_of_truth: source-code
source_revision: "bad2f0c"
verified_date: 2026-09-03
generated: true
aliases: []
tags: ["traceability"]
source_files:
  - "scripts/rebuild-obsidian-kb.mjs"
---

# Traceability Matrix

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

| Knowledge | Primary implementation | Tests／contract |
|---|---|---|
| Function catalog | `balance-component.model.ts` | Angular specs |
| Balance calculation | `domain/balanceDerivation.ts` | domain tests |
| Exposure／earmark | `domain/offBalanceExposure.ts` | domain + service tests |
| Tolerance | `domain/tolerance.ts` | tolerance tests |
| Maker／Checker | `statusTransition.ts`, release services | HTTP + Angular tests |
| API | route files | OAS + app tests |
| Persistence | schema／migrations／stores | db + store tests |
| Business Cases | `backend/data/businessCases.js` | Business Case Runner |
| B3 internal memo voucher | `domain/contingentAccountEntry.ts`, `balanceService.ts` | domain + HTTP tests |
