---
knowledge_id: MOVEMENT-RULE-064
title: "REOPEN（A11/B7）复原金额由 computeReopenRestoreAmount() 在 Submit 时伺服端计算，反转整条尚未反转的 RELEASED EXPIRE/CLOSE 沖销链，非仅最后一笔"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-26
tags:
  - balance
  - movement
  - f1
  - confirmed
---

# MOVEMENT-RULE-064 — REOPEN（A11/B7）复原金额由 computeReopenRestoreAmount() 在 Submit 时伺服端计算，反转整条尚未反转的 RELEASED EXPIRE/CLOSE 沖销链，非仅最后一笔

## Status
CONFIRMED

## Business Rule
A11（IPLC_LC）/B7（EPLC_CONFIRMATION）的 REOPEN 从来不是 Maker 手动输入金额——Amount 栏位在 UI 上完全隐藏，`req.amount` 无论前端送什么都会在 Submit 时被伺服端无条件丢弃并覆写。真实的复原金额由 `domain/reopenRestoration.ts` 的 `computeReopenRestoreAmount()` 计算：将该合约的全部 movement 依 `eventSeq` 排序后从**最新一笔往回走**，只要仍是 `status === 'RELEASED'` 且 `movementType` 为 `EXPIRE` 或 `CLOSE`，就累加其 `ceilingAmount`，一旦遇到第一笔既非 RELEASED 也非 EXPIRE/CLOSE 的移动就停止累加。这个「往回走的连续沖销链」设计是为了正确处理 F1 提案 §9.7 指出的两种真实链长：合约经一次人工 CLOSE 直接关闭（链长 1），或先经 AUTO EXPIRY（真实正数沖销金额）再经 AUTO CLOSE（此时金额已是 0）间接关闭（链长 2）——后者若只反转最后一笔 CLOSE 只会复原 0，而非合约真正的原始余额。此函式在 Maker Submit 与 Checker Release 两端都会重新呼叫一次（Release 端排除 REOPEN 自身），若两次结果不一致（例如 Submit 与 Release 之间有人以其他路径改动了沖销链），Release 会被拒绝并要求重新提交。

## Conditions
`movementType === 'REOPEN'`（`microservices/balance-component/src/service/balanceService.ts` 的 `createMovement()` 内，`req.movementType === 'REOPEN'` 分支；`release()` 内 `movement.movementType === 'REOPEN'` 分支）

## Result
REOPEN 移动的 `ceilingAmount` 等于该合约沖销链中每一笔连续、尚未反转的 RELEASED EXPIRE/CLOSE `ceilingAmount` 之总和；一笔全新的、方向为 `+1` 的移动直接以此金额建立 Confirmed Balance（而非透过额外的 REVERSAL 移动，见 [[MOVEMENT-RULE-065]]）。

## Example
路径 B 案例：合约先经 AUTO EXPIRY 沖销 10000（EXPIRE 的 `ceilingAmount = 10000`），再经 AUTO CLOSE 沖销 0（此时余额已归零，CLOSE 的 `ceilingAmount = 0`）——REOPEN Submit 时算出的复原金额为 `10000 + 0 = 10000`，Release 后 `confirmedBalance` 正确回到 `10000`，而非误算为 0。

## Verification Note
已直接阅读 `domain/reopenRestoration.ts` 全文（40 行）；已直接阅读 `service/balanceService.ts` 内 Submit 时的覆写逻辑（第 1603-1608 行）与 Release 时的重算/比对逻辑（第 1877-1898 行）。已由专属单元测试直接核实：`test/unit/service/expiryExtensionAndReopen.test.ts:279-331`（路径 A，反转单笔 CLOSE）、同档 `:332-370`（路径 B，反转 EXPIRE+CLOSE 两笔，明确断言 `reopen.movement.ceilingAmount` 为 `'10000'` 而非 `'0'`）、同档 `:992-1034`（Release 端重算侦测到链上金额漂移即拒绝）。

## Source Evidence

实现:
- `microservices/balance-component/src/domain/reopenRestoration.ts:1-40`
- `microservices/balance-component/src/service/balanceService.ts:1603-1608`
- `microservices/balance-component/src/service/balanceService.ts:1877-1898`

测试:
- `microservices/balance-component/test/unit/service/expiryExtensionAndReopen.test.ts:279-331`
- `microservices/balance-component/test/unit/service/expiryExtensionAndReopen.test.ts:332-370`
- `microservices/balance-component/test/unit/service/expiryExtensionAndReopen.test.ts:992-1034`

## Related Knowledge
- [[A11-LC-Reopen]]
- [[B7-Confirmed-LC-Reopen]]
- [[MOVEMENT-RULE-065]]
- [[MOVEMENT-RULE-053]]
- [[STATUS-RULE-032]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
