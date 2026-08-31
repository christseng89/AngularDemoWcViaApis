---
knowledge_id: EXPOSURE-RULE-013
title: "A3S 自身的 SG 赎回选择器会排除任何实时可用余额为零的 SG"
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

# EXPOSURE-RULE-013 — A3S 自身的 SG 赎回选择器会排除任何实时可用余额为零的 SG

## 状态
CONFIRMED

## 业务规则
SG 的 BalanceContract.status 即使在完全赎回后仍保持 ACTIVE，因此唯一可靠的「已无可赎回余额」信号，是其实时快照显示可用余额为零——这与本代码库中每一个选择器所遵循的「零余额即排除」惯例一致。

## 条件
快照存在，且 snapshot.availableBalance !== '0'。

## 结果
SG 会被纳入 sgsForArrival（A3S 自身的 Step-2 选择器）；已完全赎回的 SG 会被静默排除，而不是显示为禁用行。

## 示例
一笔发行金额为 10,000 且已完全赎回（可用余额为 0）的 SG，会从该 LC 对应的 A3S 自身 SG 选择器中完全消失。

## 验证说明
单一候选，Angular 端，本轮未独立重新通读（不在本次微服务领域代码采样范围内）。原始候选未引用任何测试证据，鉴于本项目针对被抽取出的服务有明确记载的「纯类/无 TestBed」惯例，这是可信的，且在没有正面理由怀疑的情况下不宜下调置信度；因引用具体且可信，保留为 CONFIRMED，但证据强度弱于上文经微服务代码验证的规则。

## 原始码证据

实现：
- `src/app/transaction-builder/picker-selection.service.ts:90-131`

测试：
- （未引用直接测试证据）

## 相关知识
- [[Off-Balance-Sheet Exposure]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
