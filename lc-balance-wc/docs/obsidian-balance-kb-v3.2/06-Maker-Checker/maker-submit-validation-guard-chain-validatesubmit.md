---
knowledge_id: maker-submit-validation-guard-chain-validatesubmit
title: "Maker Submit 校验守卫链（validateSubmit）"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# Maker Submit 校验守卫链（validateSubmit）

这是每一次 A1-A10/B1-B6 的 Submit 操作，在组装出 CreateMovementRequest 之前必须依次通过的守卫链。各守卫按固定顺序执行；第一个失败的守卫会以自身的提示信息短路终止后续校验，但前面守卫已产生的 patch（例如 A1 的 tenorDays 归一化）即便后面的守卫在同一次调用中失败，依然会被保留应用。

```mermaid
flowchart TD
  A["开始 validateSubmit()"] --> B{"instrumentType、movementType、\namount、currency、createdBy\n是否均已提供？"}
  B -- 否 --> B1["失败：请填写 amount、currency、createdBy。"]
  B -- 是 --> C{"Amount 是否超出\ncurrency 允许的小数位数？"}
  C -- 是 --> C1["失败：小数位数过多"]
  C -- 否 --> D{"movementType !== CLOSE\n且 amount <= 0？"}
  D -- 是 --> D1["失败：Amount 必须大于 0。"]
  D -- 否 --> E{"dynamicSecondaryRefLabel 已设置\n且 secondaryRef 为空？"}
  E -- 是 --> E1["失败：{label} 为必填项"]
  E -- 否 --> F{"处于创建流程 + SHGT\n且 sgNumber 为空？"}
  F -- 是 --> F1["失败：SG Number 为必填项"]
  F -- 否 --> G{"lcNumberFromParent\n且 lcNumber 为空？"}
  G -- 是 --> G1["失败：请先选择 Parent LC"]
  G -- 否 --> H{"处于创建流程、无父级，\n且 lcNumber 为空？"}
  H -- 是 --> H1["失败：LC Number 为必填项"]
  H -- 否 --> I{"需要 ibNumber\n且为空？"}
  I -- 是 --> I1["失败：IB/EB Number 为必填项"]
  I -- 否 --> J{"tenorTypeOptions 已设置\n且 tenorType 为空？"}
  J -- 是 --> J1["失败：Tenor Type 为必填项"]
  J -- 否 --> K{"code === A1？"}
  K -- 是，Sight --> K1["patch.tenorDays = 0"]
  K -- 是，Usance 且 days<=0 --> K2["失败：Tenor Days 必须 > 0"]
  K -- 否 / Usance 且 days>0 --> L{"settlesDocumentArrival\n且无 selectedPayMovement？"}
  L -- 是 --> L1["失败：请先选择仍处于 PENDING 的记录"]
  L -- 否 --> M{"documentArrivalWithSg\n且缺少 SG/快照？"}
  M -- 是 --> M1["失败：请先选择 Shipping Guarantee"]
  M -- 否 --> N{"amountVsAvailableDerivation\n=== REDEEM（A9）？"}
  N -- 是，无快照 --> N1["失败：请先查找 SG"]
  N -- 是，amount != available --> N2["失败：金额必须等于全部 Available Balance"]
  N -- 是，amount == available --> N3["patch.movementType = FULL_REDEEM"]
  N -- 否 --> O{"amountVsAvailableDerivation\n=== SETTLE（B5）？"}
  O -- 是，无快照 --> O1["失败：请先查找 Acceptance"]
  O -- 是，amount > available --> O2["失败：不得超过 Available"]
  O -- 是，amount <= available --> O3["patch.movementType = FULL_SETTLE 或 PARTIAL_SETTLE"]
  O -- 否 --> P{"subChoice.key === amendDirection\n且尚未选择方向？（B2）"}
  P -- 是 --> P1["失败：请选择 Increase 或 Decrease"]
  P -- 否 --> Q["通过：return { error: null, patch }"]
  N3 --> Q
  O3 --> Q
  K1 --> L
```

## Source Evidence

- `submit-rules.ts:55-158`

## Related Knowledge

- Angular 业务功能目录（Strategy/Policy/Rules）
- [[Business-Rule-Index]]
