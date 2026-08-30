---
knowledge_id: MOVEMENT-RULE-005
title: "赎回／结算金额可以是部分金额（在允许的情况下），且始终是 Maker 明确提交的数值，绝不会从关联 movement 中自动推导"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - movement
  - confirmed
---

# MOVEMENT-RULE-005 — 赎回／结算金额可以是部分金额（在允许的情况下），且始终是 Maker 明确提交的数值，绝不会从关联 movement 中自动推导

## 状态
CONFIRMED

## 业务规则
checkRedeemSufficiency() 将 redeemAmount 作为调用方提供的参数，其内部没有任何自动推导逻辑——一笔赎回／结算可以只释放某记录未偿余额中的一部分，但该金额绝不会从相关联的 UTILIZE／单据到单（Document Arrival）金额中推断得出，即便二者数值恰好相同也是如此。（注：这一通用性受到另行记录的 A9 专属『Full-Redeem 锁定』规则的限定——该金额本身仍然不会被推断／自动匹配，但对 A9 而言，该金额在 UI 上被锁定为恰好等于 Available Balance，而不能自由输入。）

## 条件
不适用（这是关于金额来源方式的设计约束，而非一个数值型关卡）。

## 结果
checkRedeemSufficiency() 中没有任何路径会读取其他任何 movement 的金额。

## 示例
Import LC Case 4（业务已于 2026-08-14 确认）：一份覆盖整笔 LC 的 SG，仅针对其中单据已被退回／作废的那部分金额进行了赎回。

## 验证说明
已对照源代码文档注释与函数签名确认。

## 来源证据

实现：
- `microservices/balance-component/src/domain/shgtRedeem.ts:7-14`

测试：
- （未引用直接测试证据）

## 相关知识
- [[BalanceMovement]]
- [[checkredeemsufficiency|checkRedeemSufficiency()]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
