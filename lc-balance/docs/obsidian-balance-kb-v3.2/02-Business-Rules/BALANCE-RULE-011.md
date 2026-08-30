---
knowledge_id: BALANCE-RULE-011
title: "客户端实时余额充足性预警分为两级：仅具备 plain-Available 逻辑的功能在 plain-Available 范围内只会退回一次到 Tight 提示；仅具备 Tight 检查的功能（B3/A8）始终显示 Tight 级别的预警，即便金额同时也超出了 plain Available"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - balance
  - confirmed
---

# BALANCE-RULE-011 — 客户端实时余额充足性预警分为两级：仅具备 plain-Available 逻辑的功能在 plain-Available 范围内只会退回一次到 Tight 提示；仅具备 Tight 检查的功能（B3/A8）始终显示 Tight 级别的预警，即便金额同时也超出了 plain Available

## 状态
CONFIRMED

## 业务规则
Maker 表单每次按键最多只显示一条"超出余额"预警。同时具备 plain-Available 与 Tight-Available 两层服务端检查的功能（UTILIZE/HONOUR/ACCEPT，以及 A2/B2 的 Amend-Decrease 方向）在金额 > plain Available 时显示 plain 级别的预警，只有当金额在 plain Available 范围内但超出 Tight 时，才显示 Tight 级别的预警。服务端检查仅为 Tight 级别的功能（B3、A8）则始终落到 Tight 级别的预警。曾经出现过一个真实缺陷（现场发现）：`<= availableBalance` 这道防护会在金额同时超出 plain Available 时，悄悄压制掉 B3/A8 唯一的预警，导致完全不显示任何提示；后来通过将该防护条件绑定到 `checksAgainstPlainAvailable` 上而修复。

## 触发条件
checksAgainstTightAvailable=true 决定是否会出现任何 Tight 级别预警；checksAgainstPlainAvailable 进一步决定在落到 Tight 级别提示之前，是否先应用 `<= availableBalance` 这道防护。

## 结果
第一级（"超出可用余额"）适用于 UTILIZE/HONOUR/ACCEPT/Amend-Decrease，在金额 > plain Available 时触发；第二级（"超出严格可用余额"）适用于同一批功能，在金额处于 plain Available 范围内但 > Tight 时触发；对 B3/A8 则无条件触发第二级。

## 示例
一笔 LC 已被完全占用（Available 10000，Tight 0）；B3 键入金额 20000——修复前，`<= availableBalance` 这道防护会悄悄压制掉 Tight 级别的预警（因为 20000 > 10000），导致完全不显示任何提示，即便服务端本应拒绝该请求。

## 验证说明
单一来源，属于客户端 UI 逻辑（根据本项目自身披露的"无 TestBed"惯例，此处没有自动化测试——覆盖仅来自文档注释所记录的现场验证，出自 CLAUDE.md 自身的决策日志）。直接重新阅读了这两个 getter——其函数体与文档注释与该论断精确吻合，包括现场复现的确切缺陷场景。鉴于代码本身清晰明确，且完整自我记录了缺陷/修复的来龙去脉，维持 CONFIRMED，但标注了该结论依赖于阅读代码 + 作者自己的文档注释，而非可执行测试。

## 来源证据

实现:
- `src/app/transaction-builder/maker-panel.component.ts:358-405`

测试:
- （未引用直接测试证据）

## 相关知识
- [[Balance Derivation Rules]]
- checksAgainstTightAvailable getter
- checksAgainstPlainAvailable getter
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
