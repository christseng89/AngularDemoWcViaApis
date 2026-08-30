---
knowledge_id: channelfunction-catalog-14-named-business-functions
title: "ChannelFunction 目录 — 14 个命名业务功能"
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

# ChannelFunction 目录 — 14 个命名业务功能

GET /channel/functions 被记录为 Angular 客户端自身 IMPORT_FUNCTIONS/EXPORT_FUNCTIONS 注册表的权威机器可读镜像——共 14 条记录（A1、A2、A3、A3S、A4、A6、A7、A8、A9、B1、B2、B3、B4、B5），每条记录携带 instrumentType、固定的 movementType 或 movementTypeChoice、hasParent、currencyMode、submitsTransaction，以及 compoundLegs（底层各条 leg 的 instrumentType/movementType 组合的有序列表）。在 ChannelTransaction/ChannelFunction 的枚举代码列表中，A7 自身的代码在某一处缺失，但在示例集合中却存在——这一差异值得核查（见 gaps 相关记录）。

## Source Evidence

- `balance-component-channel-api.yaml lines 587-665 (ChannelFunction schema)`
- `balance-component-channel-api.yaml lines 832-982 (AllChannelFunctions example, all 14 entries)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
