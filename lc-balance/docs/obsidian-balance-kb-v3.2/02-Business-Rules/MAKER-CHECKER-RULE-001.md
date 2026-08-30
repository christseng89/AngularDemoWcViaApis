---
knowledge_id: MAKER-CHECKER-RULE-001
title: "Maker/Checker 同一人分离验证属于银行政策范畴，本状态机不做强制检查"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - maker-checker
  - confirmed
---

# MAKER-CHECKER-RULE-001 — Maker/Checker 同一人分离验证属于银行政策范畴，本状态机不做强制检查

## 状态
CONFIRMED

## 技术要点
applyStatusTransition() 仅将 createdBy 与 actingUser 当作审计元数据保存，从不对两者进行比较，也不会因为同一用户既是当初的 Maker、又是当前的操作者，就拒绝该操作。真正的四眼（4-eyes）职责分离，委托给发起银行自身的外部角色/权限/授权系统处理——该档案自身开头的注释已明确记载，这是一项蓄意的业务决策（2026-08-14）。

完整的范畴判断说明见 [[Balance Component Overview#范畴之外]] 的"范畴之外"小节，此处不重复展开。

## 来源证据

实现代码：
- `microservices/balance-component/src/domain/statusTransition.ts:1-38 (header comment + LEGAL_TRANSITIONS table)`

测试：
- `microservices/balance-component/test/unit/domain/statusTransition.test.ts:16-18`

## 2026-08-26 补充更正——本条规则的核心论断已被业务反转，现已被 MAKER-CHECKER-RULE-060/061 取代

> [!warning] 本条规则已被反转（2026-08-24 业务确认），标题与「技术要点」保留仅作历史沿革记录
> 本条目标题及正文所述的「本状态机不做强制检查」「委托给发起银行自身的外部角色/权限/授权系统处理」，正是 2026-08-14 的原始设计立场——**业务方已于 2026-08-24 明确将其反转为真正的 4-eyes 分离**：`applyStatusTransition()` 现在会对 RELEASE/REJECT 两个动作调用新增的 `assertMakerCheckerSeparation(createdBy, actingUser, action)`，`createdBy === actingUser` 时抛出 `MakerCheckerConflictError`（HTTP 409 `MAKER_CHECKER_CONFLICT`）。CANCEL/EDIT 不受影响，理由不变（CANCEL 是 Maker 对自己 PENDING 记录的 Error Correction，两者相同是预期情形而非冲突）。
>
> 完整规则见新增的 [[MAKER-CHECKER-RULE-060]]（RELEASE/REJECT）与 [[MAKER-CHECKER-RULE-061]]（acknowledgeArrival()，绕过 applyStatusTransition() 直接调用同一函数）。本条目原有内容不再删除，仅标记为已被取代，供追溯 2026-08-14 到 2026-08-24 之间设计立场变化的历史轨迹使用。

## 相关知识
- [[Maker Checker Lifecycle]]
- Maker/Checker (4-eyes) movement lifecycle
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
