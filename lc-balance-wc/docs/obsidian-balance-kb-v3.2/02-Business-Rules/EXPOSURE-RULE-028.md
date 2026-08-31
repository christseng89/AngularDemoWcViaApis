---
knowledge_id: EXPOSURE-RULE-028
title: "父子合约关联关系（parent_logical_contract_id：SHGT/Acceptance/EPLC_EXAMINATION → 父 LC）由应用层维护，数据库并未以 FOREIGN KEY 强制约束"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — 分析快照中没有 .git 历史记录，参见 [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - exposure
  - confirmed
---

# EXPOSURE-RULE-028 — 父子合约关联关系（parent_logical_contract_id：SHGT/Acceptance/EPLC_EXAMINATION → 父 LC）由应用层维护，数据库并未以 FOREIGN KEY 强制约束

## 状态
CONFIRMED

## 业务规则
parent_logical_contract_id 将子合约（SHGT、Acceptance 或 EPLC_EXAMINATION）关联到其所属 LC/Confirmation 的 logical_contract_id，但这一关系在 schema 中并未建立 FOREIGN KEY 约束——不同于截至 2026-08-21 已具备真实外键约束的版本链与异动替代（supersession）关联。

## 条件
任何涉及遍历 parent_logical_contract_id 的子合约创建或表外敞口查询。

## 结果
这一关系的引用正确性完全依赖应用代码本身的正确性；数据库不会拒绝一个悬空或格式错误的父引用。

## 示例
idx_contracts_parent（复合索引：parent_logical_contract_id, instrument_type）支持快速查找某张 LC 的子 SHGT/Acceptance/Examination 记录，但这只是一个性能索引，而非完整性约束。

## 验证说明
已直接对照转换后的数据库设计文档（中文源文件）grep 核实——确认原文（「parent_logical_contract_id）仍是应用层以业务键维护的逻辑关联，资料库 schema 本身并未对它建立 FOREIGN KEY 约束」）存在，且与候选描述完全吻合。相较原候选仅有引用而未核实的状态，本轮已提升为独立验证。

## 原始码证据

实现：
- `Balance-Component-DB-Design.txt §3 (lines 130-140), §4.1 (lines 171-173) — 已在转换版 converted/Balance-Component-DB-Design.txt 中 grep 核实：第 138-139 行「parent_logical_contract_id）仍是應用層以業務鍵維護的邏輯關聯，資料庫 schema 本身並未對它建立 FOREIGN KEY 約束」，以及第 171 行字段说明「業務鍵關聯，非 FK」`

测试：
- （未引用直接测试证据）

## 相关知识
- [[Off-Balance-Sheet Exposure]]
- parent_logical_contract_id 是纯应用层关系，而非数据库外键
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
