---
knowledge_id: sg-issue-cap-checkshgtissuesufficiency
title: "SG 签发上限（checkShgtIssueSufficiency）"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — 本次分析快照中无 .git 历史记录，参见 [[Source-to-Knowledge-Map|来源知识对照表]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# SG 签发上限（checkShgtIssueSufficiency）

一笔新签发的 SG 金额不得超过其母 LC 的紧缩可用余额，且该余额本身还须先扣除该 LC 项下已存在的未偿 SG 风险敞口（existingShgtExposure，由调用方经 computeOffBalanceExposure 推算得出）。这项设计防止两笔重叠的 SG 签发，各自单独通过一项只孤立查看 LC 原始余额的检查。与紧缩可用余额一般公式相同，均采用「增加从严、占用从宽」的 PENDING 处理方式：PENDING 的减少立即生效，PENDING 的增加则暂不计入。

## Source Evidence

- `microservices/balance-component/src/domain/offBalanceExposure.ts:79-107`
- `test/unit/domain/offBalanceExposure.test.ts:179-247`

## Related Knowledge

- [[Business-Rule-Index|业务规则索引]]
- [[Balance Component Overview|余额组件概览]]
