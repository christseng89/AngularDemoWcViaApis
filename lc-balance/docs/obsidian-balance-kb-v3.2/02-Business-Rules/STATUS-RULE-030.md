---
knowledge_id: STATUS-RULE-030
title: "LC／保兑到期与撤销的余额冲正是一项已定义的需求，但没有对应已实现的 movementType"
domain: Balance
category: Business Rule
status: SUPERSEDED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-26
tags:
  - balance
  - status
  - confirmed
---

# STATUS-RULE-030 — LC／保兑到期与撤销的余额冲正是一项已定义的需求，但没有对应已实现的 movementType

## 状态
SUPERSEDED — 本规则描述的『缺口』已于 2026-08-25 由 F1 功能史诗（EXPIRE/REOPEN movementType）填补，见下方『2026-08-26 更新』。原始内容予以保留，不做删除。

## 业务规则
源头台账（ledger）规范认为，对每一个在范围内的产品（LC、保兑），未释放的剩余余额在到期或撤销时都需要一笔冲正分录（reversal entry）。Balance Component 中 IPLC_LC/EPLC_CONFIRMATION 实际的 movementType 集合并不包含 EXPIRE 或普通的 CANCEL movementType——Folio 1/Folio 4 中『释放（剩余）／到期／撤销』的记录行，仅仅记录了所需的借／贷（Dr/Cr）配对，而不是一个可调用的 Transaction Builder 功能。

## 条件
任何 ACTIVE 状态的 LC／保兑，其表外或有负债配对（contingent pair）在到期／撤销之前从未透过法律事件被完全释放，且也没有提交 Maker/Checker 的 CLOSE 操作。

## 结果
不存在任何自动的、由日期触发的功能来记录这笔所需的余额冲正。

## 示例
一份未被使用而失效的 LC，若存在剩余的 Confirmed Balance，并没有自动的 EXPIRE 功能来冲正其「未偿付跟单信用证（Documentary Credits Outstanding）／客户负债（Customers' Liability）」配对科目。

## 验证说明
直接确认了 movementType 清单（不含 EXPIRE/CANCEL）。相较原候选规则做了精修：A10/B6 CLOSE（于 2026-08-21 新增，晚于本台账文档撰写时间）现已提供一种由 Maker/Checker *触发* 的注销机制，在功能上与本文档所描述的余额冲正相似——但它并非由日期触发（没有自动的到期机制），也没有区分不同的『原因』跟踪（撤销、到期、自愿关闭均归为同一个 CLOSE movementType）。因此本文档的核心主张——不存在自动的、由日期触发的到期／撤销功能——至今仍然成立；只是『完全尚未实现』这一表述需要更新。

## 2026-08-26 更新（订正，原始内容保留于上方，不予删除）

F1 功能史诗（external BA review，"UCP 600 第16(f)条自动释放"提案，`analysis/Balance-Component-F1-Expire-Proposal-zh.md`）已于 2026-08-25 正式新增 **`EXPIRE`** 与 **`REOPEN`** 两个 movementType（`microservices/balance-component/src/db/schema.ts:76,79` 的 `MOVEMENT_TYPE_VALUES` 现已包含两者），使本规则原本记载的『没有对应已实现的 movementType』这一核心主张自 2026-08-25 起不再成立：

- **`EXPIRE`**（AUTO EXPIRY）——本规则原文最后一句『不存在自动的、由日期触发的功能来记录这笔所需的余额冲正』现已被推翻：`EXPIRE` 正是一个由背景批次日期触发（`expiryDate + mailFloatGraceDays` 到期后自动执行）、写死使用两个系统身份（`BATCH_MAKER_ACTOR`/`BATCH_CHECKER_ACTOR`）走 Maker/Checker 四眼原则的自动冲正机制——完整机制见 [[STATUS-RULE-031]] 与 [[auto-expiry-auto-close-background-sweep-and-grace-period]]。`EXPIRE` 资格判定刻意不比照既有 A10/B6 CLOSE 的 SG/Acceptance 余额归零条件（见 [[MOVEMENT-RULE-063]]），与本规则原文引述的 Folio 1/Folio 4『释放（剩余）／到期／撤销』记录行语意完全对应。
- **`REOPEN`**（A11/B7 LC/Confirmed LC Reopen）——本规则原文『验证说明』一节曾指出 A10/B6 CLOSE『没有区分不同的原因跟踪（撤销、到期、自愿关闭均归为同一个 CLOSE movementType）』——F1 上线后，`CLOSE`／`REOPEN` 双双新增强制 `reasonCode`（[[MAKER-CHECKER-RULE-059]]），为『原因跟踪』补上了一个通用的自由文本字段（虽非结构化的『撤销 vs. 到期 vs. 自愿关闭』枚举，但已可由 Maker 自行填写区分）。`REOPEN` 本身则是本规则原文完全没有预见到的新增能力——不仅补上冲正，还提供了『冲正之后可再重新建立』的逆向路径，完整机制见 [[A11-LC-Reopen]]／[[B7-Confirmed-LC-Reopen]]／[[MOVEMENT-RULE-064]]。

**结论**：本规则原文所述『需求已定义、但缺少对应 movementType』的落差，已由 F1 功能史诗以 `EXPIRE`/`REOPEN` 两个新 movementType 正式实现并填补，状态更新为 SUPERSEDED。本规则原始内容（含验证说明中 2026-08-21 对 A10/B6 CLOSE 的既有精修）予以完整保留，作为理解此规则演进脉络的历史记录，不予删除。

## 来源证据

实现：
- `analysis/contingent-liability-ledger.html (Folio 1/Folio 4 residual rows, Notes item 4)`
- `microservices/balance-component/src/db/schema.ts:58-74 (MOVEMENT_TYPE_VALUES — no EXPIRE/CANCEL value, 2026-08-22 快照当下)`
- 2026-08-26 更新：`microservices/balance-component/src/db/schema.ts:58-80 (MOVEMENT_TYPE_VALUES 现已包含 EXPIRE/AMEND_EXPIRY_DATE/REVERSAL/REOPEN，2026-08-25 F1 新增)`
- 2026-08-26 更新：`microservices/balance-component/src/domain/expiryEligibility.ts` 全文（EXPIRE 资格判定）
- 2026-08-26 更新：`microservices/balance-component/src/domain/reopenRestoration.ts` 全文（REOPEN 复原金额计算）

测试：
- （未引用直接测试证据）

## 相关知识
- [[Close Eligibility]]
- [[STATUS-RULE-031]] — 2026-08-26 新增：AUTO EXPIRY 填补本规则原文所述的缺口
- [[MOVEMENT-RULE-063]] — 2026-08-26 新增：EXPIRE 资格判定细节
- [[MOVEMENT-RULE-064]] — 2026-08-26 新增：REOPEN 复原金额计算
- [[MAKER-CHECKER-RULE-059]] — 2026-08-26 新增：CLOSE/REOPEN 强制 reasonCode，补上『原因跟踪』
- [[A11-LC-Reopen]] — 2026-08-26 新增
- [[B7-Confirmed-LC-Reopen]] — 2026-08-26 新增
- [[auto-expiry-auto-close-background-sweep-and-grace-period]] — 2026-08-26 新增
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
