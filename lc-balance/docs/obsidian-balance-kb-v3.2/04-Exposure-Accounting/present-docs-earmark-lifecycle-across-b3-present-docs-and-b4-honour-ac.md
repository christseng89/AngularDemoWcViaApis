---
knowledge_id: present-docs-earmark-lifecycle-across-b3-present-docs-and-b4-honour-ac
title: "单据提示圈存跨 B3（单据提示）与 B4（Honour/Accept）的生命周期"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# 单据提示圈存跨 B3（单据提示）与 B4（Honour/Accept）的生命周期

本图展示一笔出口提示对保兑紧缩可用余额的贡献，如何随着 B3 与 B4 各自经历 Maker 提交与 Checker 解除，依次流转于 Pending（待处理）、Approved（已核准）、Provisionally-Consumed（暂时性已消耗）三种状态之间。

```mermaid
flowchart TD
  A["B3 Maker 提交 — EPLC_EXAMINATION CREATE"] --> B["status=PENDING，presentDocsConsumedAt=null"]
  B --> C["同时计入 computePresentDocsEarmarkPending 与 computePresentDocsEarmark（合计）"]
  C --> D{"提交时执行 checkPresentDocsIssueSufficiency：是否仍在保兑紧缩可用余额之内？"}
  D -- 否 --> E["报错——在建立 PENDING 记录之前即被拒绝"]
  D -- 是 --> F["B3 Checker 解除"]
  F --> G["status=RELEASED，presentDocsConsumedAt 仍为 null——不产生 accountEntry（因 EPLC_EXAMINATION 为 MEMO_ONLY）"]
  G --> H["此时计入 computePresentDocsEarmarkApproved 与 computePresentDocsEarmark（合计）——不再计入 Pending"]
  H --> I["B4 Maker 提交 — HONOUR/ACCEPT，referencedTransactionId 指向此 B3 的 movementId"]
  I --> J["derivePresentDocsProvisionallyConsumedIds() 此时已包含此 movementId"]
  J --> K["在 B4 仍为 PENDING 期间，同时从 computePresentDocsEarmarkApproved 与 computePresentDocsEarmark 中排除"]
  K --> L["B4 Checker 解除"]
  L --> M["release() 作为附带效果，在 B3 记录上设置 presentDocsConsumedAt"]
  M --> N["永久性地从所有圈存统计口径中排除——已完全消耗"]
```

## Related Knowledge

- [[Off-Balance-Sheet Exposure|表外风险敞口与或有科目分录]]
- [[Business-Rule-Index|业务规则索引]]
