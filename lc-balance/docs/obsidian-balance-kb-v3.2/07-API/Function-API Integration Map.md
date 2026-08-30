---
knowledge_id: Function-API-Integration-Map
title: "功能-API 整合对照表（16 个命名业务功能 × API 端点 × 交易情境）"
domain: Balance
category: Reference
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-30
tags:
  - balance
  - api
  - reference
  - function-map
  - import
  - export
---

# 功能-API 整合对照表（16 个命名业务功能 × API 端点 × 交易情境）

本页是给开发者的**快速查阅入口**，不是重复各功能笔记里的完整业务逻辑——它只做一件事：把 A1–A11（进口）/ B1–B7（出口）这 18 个命名业务功能，跟它们各自实际调用的 API 端点、调用链、以及在 Import LC / Export Confirmed LC 生命周期中的位置对齐在同一张表里，并链接回每个功能自己的详细笔记。

**关键背景，先读这两点再看表格，否则容易误解端点列：**

1. **底层是通用端点，不是 16 条不同的路径。** Balance Microservice（`analysis/balance-component-api.yaml`）只有一组按 instrument 无关设计的通用端点——`POST /balance-movements`、`POST /balance-movements/{id}/release` 等——所有 16 个功能都复用同一批端点，实际行为完全由请求体里的 `instrumentType`/`movementType`（以及 `parentLogicalContractId`/`referencedTransactionId`/`businessEventId` 等关联字段）决定，服务端本身并不知道 A1/B1 这些功能代码。下表的"API 端点"列会同时列出 Method+Path 和触发该行为所需的 `instrumentType`/`movementType` 组合。
2. **Channel API 是规格契约，不是正在跑的服务。** `analysis/balance-component-channel-api.yaml` 定义了一层以 `functionCode`（A1/B1…）为词汇的门面 API（`POST /channel/transactions` 等），但其 `servers` 区块自己说明：参考实现（Angular Transaction Builder）**直接调用 Microservice API，从未经过任何已建成的 Channel API 层**（详见 [[channel-api-is-a-spec-only-contract-not-a-running-service]]）。因此下表"调用链"一律标注 Angular UI 直连 Microservice 的真实路径，并在括号里注明 Channel API 层对应端点仅为规格。

## 对照表

| 功能代码 | 功能名称 | API 端点（instrumentType / movementType） | 调用链 | 交易情境（生命周期位置） | 功能笔记 |
|---|---|---|---|---|---|
| A1 | LC 开立（LC Issue） | `POST /balance-movements`（`IPLC_LC` / `ISSUE`，隐式创建 Logical Contract） | Angular UI → Microservice 直连（Channel API 对应 `POST /channel/transactions functionCode=A1`，规格未上线） | Import LC 生命周期 — **起点**：建立新的 Import LC | [[A1-LC-Issue]] |
| A2 | LC 修改（LC Amendment） | `POST /balance-movements`（`IPLC_LC` / `AMEND_INCREASE`\|`AMEND_DECREASE`，经 UI 的 subChoice 选择方向） | Angular UI → Microservice 直连 | Import LC 生命周期 — 存续期间任何时点：面额增/减修改 | [[A2-LC-Amendment]] |
| A3 | 单据到单（Document Arrival） | `POST /balance-movements`（`IPLC_LC` / `UTILIZE`，PENDING 预留）+ `POST /balance-movements/{id}/acknowledge`（Checker 确认，仅确认不 release） | Angular UI → Microservice 直连（两次调用） | Import LC 生命周期 — 押汇/单据到单阶段（预留占用，尚未终结），后续导向 A4（Sight）或 A6（Usance） | [[A3-Document-Arrival]] |
| A3S | 单据到单（含船务担保）（Document Arrival w/ Shipping Gtee） | Atomic compound submit：leg1 `SHGT` / `FULL_REDEEM`\|`PARTIAL_REDEEM`，leg2 `IPLC_LC` / `UTILIZE`，共享同一 `businessEventId`；Checker 使用 compound release | Angular UI → Microservice adapter；整组 legs 在单一数据库交易内成功或回滚 | Import LC 生命周期 — 押汇阶段，且该 LC 项下存在既有 Shipping Guarantee 需先行赎回配对（否则用纯 A3） | [[A3S-Document-Arrival-SG]] |
| A4 | 即期结汇（Sight Settlement） | 无自身的 `POST /balance-movements`（`submitsTransaction: false`）；`POST /balance-movements/{id}/maker-submit`（真实 Maker 提交动作，不转换状态）+ `POST /balance-movements/{id}/release`（终结 A3 既有的 `UTILIZE` movement） | Angular UI → Microservice 直连，作用于 A3 已建立的既有 movement，不新建 movement | Import LC 生命周期 — Sight 结汇的**终结**阶段：Checker Release 才真正把 LC Balance 从 Pending 转为 Approved/Utilized | [[A4-Sight-Settlement]] |
| A6 | 承兑（Usance）（Acceptance） | Atomic compound submit 创建 `IPLC_ACCEPTANCE` / `CREATE` 并关联来源 A3/A3S；compound release 同时终结来源 `UTILIZE` | Angular UI → Microservice adapter；compound transaction 原子执行 | Import LC 生命周期 — Usance 承兑阶段：新增 Acceptance 负债的同时，终结对应的 A3 单据到单 | [[A6-Acceptance-Usance]] |
| A7 | 承兑结算（Acceptance Settlement） | `POST /balance-movements`（`IPLC_ACCEPTANCE` / `FULL_SETTLE`\|`PARTIAL_SETTLE`，经 subChoice 选择结算类型） | Angular UI → Microservice 直连 | Import LC 生命周期 — Acceptance 到期结算阶段（不触碰 LC Balance 本身） | [[A7-Acceptance-Settlement]] |
| A8 | 船务担保开立（Shipping Gtee Issue） | `POST /balance-movements`（`SHGT` / `ISSUE`，`parentLogicalContractId` 必填，校验对父 LC 的 Tight Available Balance） | Angular UI → Microservice 直连 | Import LC 生命周期 — 平行分支：SG 开立（占用父 LC 的 Tight Available Balance） | [[A8-SG-Issue]] |
| A9 | 船务担保赎回（Shipping Gtee Redemption） | `POST /balance-movements`（`SHGT` / `FULL_REDEEM`；UI 层已锁定仅能 Full Redeem 并将 Amount 锁定为 SG 的 Available Balance，微服务本身仍接受 `PARTIAL_REDEEM`，为已知、经 BA 确认的差异——见 [[sg-redemption-amount-min-bill-amount-sg-outstanding]]） | Angular UI → Microservice 直连 | Import LC 生命周期 — 平行分支：SG 赎回（释放该 SG 项下的或有负债，与 Document Arrival 无自动关联） | [[A9-SG-Redemption]] |
| A10 | LC 结案（LC Close） | `GET /balance-contracts/close-eligible`（Step-1 挑选可结案的 LC）+ `POST /balance-movements`（`IPLC_LC` / `CLOSE`，Amount 锁定=当前 Confirmed Balance） | Angular UI → Microservice 直连 | Import LC 生命周期 — **终点**：结清剩余 Confirmed Balance 并将 LC 置为 `CLOSED`，之后不可再被任何功能选取 | [[A10-LC-Close]] |
| A11 | LC 重启（LC Reopen） | `GET /balance-contracts?includeAnyStatus=true`（Step-1 挑选 CLOSED 的 LC）+ `POST /balance-movements`（`IPLC_LC` / `REOPEN`，Amount=服务端计算的复原金额，不可键入）+ `reasonCode` 必填 | Angular UI → Microservice 直连 | Import LC 生命周期 — 从 **终点**（CLOSED）回到 ACTIVE 或 EXPIRED，反转整条未反转的 RELEASED EXPIRE/CLOSE | [[A11-LC-Reopen]] |
| B1 | 保兑（Confirm LC） | `POST /balance-movements`（`EPLC_CONFIRMATION` / `ISSUE`，隐式创建 Logical Contract） | Angular UI → Microservice 直连（Channel API 对应 `functionCode=B1`，规格未上线） | Export Confirmed LC 生命周期 — **起点**：本行对受益人做出独立保兑承诺 | [[B1-Confirm-LC]] |
| B2 | 保兑修改（Confirm LC Amendment） | `POST /balance-movements`（`EPLC_CONFIRMATION` / `AMEND`，方向由 `amount` 正负号决定，非独立 movementType） | Angular UI → Microservice 直连 | Export Confirmed LC 生命周期 — 存续期间任何时点：保兑金额（confirmed_amount）修改 | [[B2-Confirm-LC-Amendment]] |
| B3 | 交单（Present Docs） | `POST /balance-movements`（`EPLC_EXAMINATION` / `CREATE`，`MEMO_ONLY`，不影响 Confirmation 余额）+ `POST /balance-movements/{id}/release`（2026-08-18 起为真实 release，见 [[b3-genuinely-releases-the-removed-acknowledge-only-design]]） | Angular UI → Microservice 直连 | Export Confirmed LC 生命周期 — 交单阶段（物理事件，仅预留 Present Docs Earmark），导向 B4 | [[B3-Present-Docs]] |
| B4 | 兑付/承兑（Honour / Acceptance） | Atomic compound submit：primary `EPLC_CONFIRMATION` / `HONOUR`\|`ACCEPT` 关联 B3，加上 Sight 或 Usance 所需资产 legs，共享同一 `businessEventId`；Checker 使用 compound release | Angular UI → Microservice adapter；Submit／Release 均以整组 transaction 原子执行 | Export Confirmed LC 生命周期 — 兑付/承兑法律事件阶段：终结 B3 交单记录（消费其 Present Docs Earmark 占用），同时释放 Confirmation 或有负债并产生资产科目 | [[B4-Honour-Acceptance]] |
| B5 | 偿付/到期结算（Settlement — Reimbursement / Maturity） | 两笔关联的 `POST /balance-movements`：`EPLC_ACCEPTANCE` / `FULL_SETTLE` + `EPLC_ACCEPTANCE_REIMB_RECEIVABLE` / `REIMBURSE`，共享同一 `businessEventId`，同一次 Checker Release 一并结清 | Angular UI → Microservice 直连 | Export Confirmed LC 生命周期 — Usance 到期结算阶段：Acceptance 负债与其配对的 Reimbursement Receivable 资产同时结清（Sight 侧的 Due from Issuing Bank 收款不在 Balance Component 范围内） | [[B5-Settlement-Reimbursement-Maturity]] |
| B6 | 保兑信用状结案（Confirmed LC Close） | `GET /balance-contracts/close-eligible`（Step-1 挑选可结案的 Confirmation）+ `POST /balance-movements`（`EPLC_CONFIRMATION` / `CLOSE`，Amount 锁定=当前 Confirmed Balance） | Angular UI → Microservice 直连 | Export Confirmed LC 生命周期 — **终点**：结清剩余 Confirmed Balance 并将 Confirmation 置为 `CLOSED` | [[B6-Confirmed-LC-Close]] |
| B7 | 保兑信用状重启（Confirmed LC Reopen） | `GET /balance-contracts?includeAnyStatus=true`（Step-1 挑选 CLOSED 的 Confirmation）+ `POST /balance-movements`（`EPLC_CONFIRMATION` / `REOPEN`，Amount=服务端计算的复原金额，不可键入）+ `reasonCode` 必填 | Angular UI → Microservice 直连 | Export Confirmed LC 生命周期 — 从 **终点**（CLOSED）回到 ACTIVE 或 EXPIRED | [[B7-Confirmed-LC-Reopen]] |

## 使用提示

- 需要看某功能完整的请求/响应字段、充足性检查公式、Maker/Checker 状态机细节 → 点表格最后一列的功能笔记。
- 需要看端点本身的通用契约（幂等性、错误码、`businessEventId` 关联查询等，与具体功能代码无关）→ 参见 [[API Index]] 里按端点/概念组织的其余笔记，例如 [[microservice-oas-endpoint-inventory]]、[[one-movement-one-leg-one-call-correlation-without-atomicity]]、[[maker-checker-4-eyes-lifecycle]]。
- 需要看 Channel API 规格本身（尚未上线）→ [[channel-oas-endpoint-inventory]]、[[channelfunction-catalog-14-named-business-functions]]。

## Source Evidence

- `analysis/balance-component-api.yaml`（Microservice OAS，`paths` 区块，`/balance-contracts*`/`/balance-movements*` 全部端点定义）
- `analysis/balance-component-channel-api.yaml` lines 1–120（servers 区块，说明参考实现直连 Microservice，Channel 层未上线）、lines 832–981（`AllChannelFunctions` 示例，A1–B5 共 14 条 functionCode 记录）
- `src/app/transaction-builder/balance-component.model.ts` lines 267–500（`IMPORT_FUNCTIONS`/`EXPORT_FUNCTIONS` 注册表，A1–A11/B1–B7 共 18 条（A11 code 定义于第 447 行、B7 于第 559 行，2026-08-26 新增，已核实），含各自 `instrumentType`/`movementType`/`hasParent`/`payableMovementType`/`requiresCloseEligibility` 等字段，是本页比对的直接依据）

## Related Knowledge

- [[API Index]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
