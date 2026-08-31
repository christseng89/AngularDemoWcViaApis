---
knowledge_id: STATUS-RULE-010
title: "每个 logicalContractId 至多只能有一个 ACTIVE 状态的合约版本（由一个部分唯一索引在数据库层强制保证）"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - status
  - confirmed
---

# STATUS-RULE-010 — 每个 logicalContractId 至多只能有一个 ACTIVE 状态的合约版本（由一个部分唯一索引在数据库层强制保证）

## 状态
CONFIRMED

## 业务规则
idx_contracts_one_active 是建立在 (logical_contract_id) 上、条件为 WHERE status='ACTIVE' 的唯一索引——由数据库自身保证，给定的 logicalContractId 在任意时刻不会拥有一条以上处于 ACTIVE 状态的 balance_contracts 记录。

## 触发条件
任何试图为一个已经拥有 ACTIVE 记录的 logicalContractId 再插入第二条 ACTIVE 记录的 INSERT 操作。

## 结果
该插入操作会在数据库层因唯一约束冲突而失败。

## 示例
插入 bc-1（lc-1, v1, ACTIVE）成功；若未先将 bc-1 标记为 superseded，再插入 bc-2（lc-1, v2, ACTIVE）会抛出异常。

## 验证说明
已核实该索引确实存在，与所声称的完全一致。验证过程中发现的重要注意事项：该约束在真实业务流程中目前处于「休眠」状态——对 balanceService.ts 进行 grep 显示，每一个真实的 createContract() 调用点（约第 1420 行）都将 contractVersion 硬编码为 1，且 markSuperseded() 在任何服务层代码路径中都从未被调用（只在一项直接操作数据库层的单元测试中被调用）。修改（AMEND_INCREASE/AMEND_DECREASE）实际上是被实现为针对同一个既有合约行的新 BalanceMovement，而不是新的合约版本——因此在当前应用中，这个索引实际上只会防范真正重复的 ISSUE，从不会真正防范一次进行中的版本切换。完整的差异细节，参见下方另一条 CONFLICT 规则（设计文档 vs. 实际代码）。

## 来源证据

实现:
- `microservices/balance-component/src/db/schema.ts:111-114`

测试:
- `microservices/balance-component/test/unit/db/schema.test.ts:69-73`

## 相关知识
- [[Close Eligibility]]
- idx_contracts_one_active
- version-chain contract model
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
