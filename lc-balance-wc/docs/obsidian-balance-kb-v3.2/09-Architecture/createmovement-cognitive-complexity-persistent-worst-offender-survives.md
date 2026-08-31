---
knowledge_id: createmovement-cognitive-complexity-persistent-worst-offender-survives
title: "createMovement() 认知复杂度——持续居首的问题热点，历经一次重构仍未根除"
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

# createMovement() 认知复杂度——持续居首的问题热点，历经一次重构仍未根除

microservices/balance-component/src/service/balanceService.ts 的 createMovement() 在 2026-08-17 的扫描中，认知复杂度（Cognitive Complexity）达到 85，是整个代码库中遥遥领先的最严重热点。BAL-141（movementType Strategy/Type-Object 登记表）以及随后的 BAL-142（抽取出 resolveOrCreateContract()、一个 newContractSufficiencyRegistry、以及可辨识联合的结果类型）都曾以其为目标，但随着围绕该登记表派发新增的按实例分支不断累积，到 2026-08-20 的扫描时又回升到了 71——仍接近允许阈值 15 的近 5 倍。

## 证据来源

- `CLAUDE.md's BAL-141/BAL-142 decision-log entries`
- `Sonar-Scan-Report.md:93`
- `SonarQube-report2.md:70,85,129`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
