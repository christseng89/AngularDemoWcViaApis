---
title: "Knowledge Gaps"
type: gap-register
domain: documentation
status: verified
source_of_truth: source-code
source_revision: "c7e9884"
verified_date: 2026-09-03
generated: true
aliases: []
tags: ["unclear"]
source_files:
  - "scripts/rebuild-obsidian-kb.mjs"
---

# Knowledge Gaps

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

只有無法由目前 Source Code、tests 或 OAS 證明的事項才列在此處。

- OAS 與 runtime route 差異應由 contract validation 持續檢查。
- 外部 Accounting component 的實際 posting、重試與 reconciliation 不在本 repository 的權威範圍。
- Production database／distributed concurrency 行為不能由本地 SQLite prototype 推論。
- UCP／SWIFT workflow consent 與 message composition 屬上游系統；本 component 只保存和驗證其 API fields。
