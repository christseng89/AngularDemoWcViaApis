---
knowledge_id: MAKER-CHECKER-RULE-030
title: "复核人自身独立搜索时，若次要键（IB/SG 编号）留空，会透过目录浏览自动解析"
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

# MAKER-CHECKER-RULE-030 — 复核人自身独立搜索时，若次要键（IB/SG 编号）留空，会透过目录浏览自动解析

## 状态
CONFIRMED

## 业务规则
当所选功能要求一个次要自然键（IB/SG 编号），而复核人只输入了 LC 编号、将该字段留空时，searchCheckerLc() 不再直接报硬性错误；而是改为浏览该 LC 下所选功能自身 instrumentType 的每一笔 ACTIVE 候选项（catalog(instrumentType,'ACTIVE',undefined,1,100,lcNumber)），并依数量决定处理方式：0 -> 真实报错，1 -> 静默自动解析并附带提示文字，>1 -> 呈现供人工挑选的清单。

## 条件
所选功能的 checkerSecondaryField 不为空，且 checkerSecondaryRef 为空。

## 结果
0 个候选项：设定 checkerSearchError，未解析出任何合约。1 个候选项：合约已解析，设定 checkerAutoPickedHint，直接载入复核队列。多于 1 个候选项：填入 checkerSecondaryCandidates 供使用者挑选，尚未载入队列。

## 示例
A9 的复核人只输入 LC1；目录返回 1 笔 SHGT 合约（G01）-> 自动挑选，checkerSecondaryRef 变为 'G01'，其队列随即载入。

## 验证说明
已由 CLAUDE.md 自身描述此确切的实况重现缺口与修正方式（S01/S02）的决策日志条目逐字佐证。已确认。

## 来源证据

实现：
- `src/app/transaction-builder/checker-panel.component.ts:147-230`

测试：
- `src/app/transaction-builder/checker-panel.component.spec.ts:274-285,351-426`

## 相关知识
- [[Maker Checker Lifecycle]]
- 复核人自身独立搜索时，次要键未知情形下的自动解析
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
