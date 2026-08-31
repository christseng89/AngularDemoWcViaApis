---
knowledge_id: channel-api-is-a-spec-only-contract-not-a-running-service
title: "Channel API 只是规格契约，并非实际运行中的服务"
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

# Channel API 只是规格契约，并非实际运行中的服务

该 Channel API 的 servers 区块明确说明：参考实现中的 Angular Transaction Builder 应用直接调用 Microservice API，并不经过任何已建成的 channel 层——本文件所规范的，是该能力预期应有的契约，而非一个正在运行的服务。这意味着本文件所陈述的每一条"业务规则"，都只是（按其自身声明）在微服务中作为纵深防御被镜像实现的设计意图，而 channel 层本身从未像 microservice API 那样，经受过真实流量的反复验证（v1.0.0 至 v1.16.0 期间被反复重新确认过基准）。

## Source Evidence

- `balance-component-channel-api.yaml lines 118-120 (servers block description)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
