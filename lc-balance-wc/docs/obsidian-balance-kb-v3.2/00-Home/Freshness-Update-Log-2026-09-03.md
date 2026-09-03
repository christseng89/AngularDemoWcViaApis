---
title: "Freshness Update Log 2026-09-03"
domain: Balance
category: Update Log
status: CONFIRMED
snapshot_date: 2026-09-03
tags:
  - balance
  - amendment
  - tolerance
---

# 2026-09-03 Amendment／Tolerance 更新

- A2／B2 改为以修改前后完整合约上限之差入账，涵盖 Amount Increase／Decrease × Tolerance Increase／Decrease 四种组合。
- 旧／新上限及下限依币别小数位采用 `ROUND_HALF_UP`；测试明确覆盖 JPY、USD、KWD。
- Movement 保存提议 Tolerance，合约值在 Checker Release 后才生效；Release 重新计算并拒绝 stale amendment。
- `AMEND_EXPIRY_DATE` 不接受 Tolerance，也不改变 Face Amount 或合约 Tolerance。外部 request Amount 固定为 0；
  ACTIVE 是零余额效果的纯日期修改，EXPIRED 则由服务端把最后一笔 RELEASED EXPIRE 的恢复金额与反向
  Account Entries 写入同一笔 PENDING Amendment，Checker Release 后才恢复 Confirmed／Tight Available Balance。
- EXPIRED Expiry Date retry 会忽略 CANCELLED／REJECTED 的旧尝试，不允许其遮蔽 RELEASED EXPIRE；Submit 与
  Release 使用相同恢复依据，且 Release 会拒绝期间遭改变的 stale basis。
- Business Case Runner 新增同一 LC 连续多笔修改案例 `import-case-16` 与 `export-case-15`。
- UCP 600 Article 10 的 beneficiary／bank consent 仍属上游 workflow；本组件只控制 Balance 条件的 Maker／Checker 生效点。
- 现有负 Tight Balance 诊断与 A02／B02 自动修复保留，不把负值视作可用容量。
- Fix Pending 现在于同一 DB transaction 重算 Event／Root／Sibling snapshots，修正后的 PENDING Balance 不需等待 Checker Release。
- A2／B2 Inquire Events 与 Current Balance 分开显示 Amendment Balance Effect、Tolerance 旧值→提案值与净 Pending Earmark Total；同一 LC 多笔 pending amendment 逐笔附 Reference 显示（S01 原交易 `0% → 10%`，Fix Pending 后 32,000／`0% → 20%`／净额 22,000）。
- A2／B2 可只改 Amount、只改 Tolerance 或两者同改；Tolerance-only 使用 API `amount: "0"`，零 Amount 且 Tolerance 不变的 no-op 被拒绝。
- RELEASED Decrease 的 Tolerance 旧值来自 RELEASED event history，正确显示例如 `20% → 15%`。
- 所有可输入 Amount 与 A1 共用 `m/k/h` parser；Available／Tight Available 即时警告也使用展开后的
  decimal 值比较。`500k` 对 `1,100,000` 不再误报，A1–A11／B1–B7 交易矩阵已回归验证。
- Available／Tight Available 即时警告只适用于真正可输入的 Amount。A4／A6／B4 等由已选交易带入的
  protected Amount 共用 Formly lock derivation，不显示 `Typed amount` 警告；A4 的 Document Arrival
  earmark 仍由既有 release 规则结算，API／OAS／DB 不变。
- Checker action failure 现在跨 plain 与 compound flow 保留原始 HTTP status／code／cause；status 0、409、
  5xx 与本地 validation 分开呈现，不再统一误标 `BAL-UI-UNEXPECTED`。A4 另有真实 HTTP regression：
  其他 Document Arrival 令 Available=0 时，仍可 Release 已 Maker-Submitted 的选定 arrival，未选中的
  earmark 继续保留。
- A4 Fix Pending 的 workflow action 现在正确覆盖专用 `Submit A4` mode：编辑时只显示 `Save Fix Pending`／
  `Cancel`，Remarks 改变后可 Save；Delete Pending review 同样不会残留 Submit A4。Chrome live acceptance 已跑完
  37 个 Run All cases，并实际完成 A4 合并索引选择、Maker Submit、Maker Queue Fix Pending 与 Save。

## 证据

- `microservices/balance-component/src/domain/tolerance.ts`
- `microservices/balance-component/src/service/balanceService.ts`
- `microservices/balance-component/test/unit/domain/tolerance.test.ts`
- `microservices/balance-component/test/unit/app.test.ts`
- `backend/data/businessCases.js`
- `microservices/balance-component/test/unit/service/expiryExtensionAndReopen.test.ts`
- `src/app/transaction-builder/maker-balance-warning.policy.ts`
- `src/app/transaction-builder/maker-balance-warning.policy.spec.ts`
- `analysis/balance-component-api.yaml` v1.49.0
- `analysis/balance-component-channel-api.yaml` v1.15.0

## 相关知识

- [[Tolerance Processing]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
