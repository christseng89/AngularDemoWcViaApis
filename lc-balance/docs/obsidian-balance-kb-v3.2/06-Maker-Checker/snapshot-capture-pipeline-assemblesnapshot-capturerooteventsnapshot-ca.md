---
knowledge_id: snapshot-capture-pipeline-assemblesnapshot-capturerooteventsnapshot-ca
title: "快照捕获流水线（assembleSnapshot / captureRootEventSnapshot / captureSiblingSnapshots / captureSnapshotBundle / resolveSnapshotWriteTarget）"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — 本次分析快照中无 .git 历史记录，详见 [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# 快照捕获流水线（assembleSnapshot / captureRootEventSnapshot / captureSiblingSnapshots / captureSnapshotBundle / resolveSnapshotWriteTarget）

这是一组分层的私有方法，用于在 Create 与 Release 两个时点计算并持久化余额状态的"快照"。assembleSnapshot() 是纯数学运算核心（confirmed/available/offBalanceExposure/tightAvailableBalance/presentDocsEarmark* 等），同时被实时的 GET .../balance 接口与变动记录发生时的捕获逻辑共用。captureRootEventSnapshot() 会额外捕获子账本所属父级 LC/Confirmation 的余额。captureSiblingSnapshots() 会捕获同一根节点下唯一明确的 Acceptance 和/或 SG 同级记录。captureSnapshotBundle() 将以上所有内容打包提供给单次调用方使用。resolveSnapshotWriteTarget() 则依据一个已计算好的布尔值（isSightUtilizeFinalize），决定 release() 的快照写入应落到普通列还是 finalize* 列。

## Source Evidence

- `balanceService.test.ts:179-478,488-642 (event snapshot / sibling snapshot test suites)`
- `balanceService.ts:565-815`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
