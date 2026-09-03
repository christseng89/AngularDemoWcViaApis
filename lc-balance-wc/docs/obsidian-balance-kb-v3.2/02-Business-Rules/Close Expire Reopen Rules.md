---
title: "Close Expire Reopen Rules"
type: rule
domain: lifecycle
status: verified
source_of_truth: source-code
source_revision: "bad2f0c"
verified_date: 2026-09-03
generated: true
aliases: []
tags: ["business-rules", "lifecycle"]
source_files:
  - "microservices/balance-component/src/domain/closeEligibility.ts"
  - "microservices/balance-component/src/domain/expiryEligibility.ts"
  - "microservices/balance-component/src/domain/reopenRestoration.ts"
  - "microservices/balance-component/src/service/lifecycleSweepService.ts"
---

# Close Expire Reopen Rules

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

Close 只適用 root LC／Confirmation，且不得存在未結子 exposure 或 open events。自動日期處理的完整觸發條件、grace periods、system actors 與狀態效果見 [[Auto Expiry and Auto Close]]。

對 EXPIRED contract 的 Expiry Date Amendment 會建立可供 Checker review 的 restoration voucher；Release 後恢復容量。Reopen 僅解析 CLOSED contract，恢復量由 trailing RELEASED EXPIRE／CLOSE chain 推導，不由 Maker 輸入。
