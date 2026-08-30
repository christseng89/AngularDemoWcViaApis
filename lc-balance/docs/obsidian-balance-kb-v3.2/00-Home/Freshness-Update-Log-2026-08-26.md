---
knowledge_id: Freshness-Update-Log-2026-08-26
title: "知识新鲜度更新日志 — 2026-08-26"
domain: Balance
category: Freshness Log
snapshot_date: 2026-08-26
tags:
  - balance
  - freshness
  - changelog
---

# 知识新鲜度更新日志 — 2026-08-26

本页依 `Balance_Component_Obsidian.md` §19「知识新鲜度」流程建立，记录本次增量同步（快照日期从 2026-08-22 推进到 2026-08-26）具体做了什么、依据什么源材料、以及诚实披露的未覆盖范围。本仓库无 `.git` 历史，§19 所述的 Git Diff 步骤以「比对 `CLAUDE.md` 决策日志中快照日期之后的全部条目」代替，逐条核实后只更新受影响的知识，而非整库重建。

## 触发依据

`CLAUDE.md`（仓库根目录）2026-08-22 至 2026-08-26 之间新增的决策日志条目——涵盖 F1 追加的 A11/B7 Reopen 与背景批次机制、A1/B1 新增校验规则、多项 Maker/Checker 正确性修复、以及若干 Angular UI 缺陷修复。完整原文见 `CLAUDE.md` 对应日期的条目本身；本页只记录「对本知识库造成什么影响、如何处理」。

## 已核实并更新的知识

| 变更主题 | 新增/修正的规则 | 涉及的功能/概念笔记 |
|---|---|---|
| A11（进口 Reopen）/ B7（出口 Reopen）新具名功能 | STATUS-RULE-031~036、MOVEMENT-RULE-063~068、MAKER-CHECKER-RULE-058~059、EXPOSURE-RULE-030 | 新增 [[A11-LC-Reopen]]、[[B7-Confirmed-LC-Reopen]]；新增 [[09-Architecture/auto-expiry-auto-close-background-sweep-and-grace-period]] |
| A1/B1 Expiry Date 强制必填 + 本国营业日校验 | MOVEMENT-RULE-075、MOVEMENT-RULE-076 | [[A1-LC-Issue]]、[[B1-Confirm-LC]] |
| 5 项 UI-only 必填栏位补齐服务端（naturalKey/sourceTransactionRef/tenorType/tenorDays） | MOVEMENT-RULE-077~081 | [[A1-LC-Issue]]、[[B1-Confirm-LC]]、[[A6-Acceptance-Usance]] |
| 真 4-eyes（MakerCheckerConflictError） | MAKER-CHECKER-RULE-060、MAKER-CHECKER-RULE-061 | Maker Checker Lifecycle、fixed-demo-maker-checker-identities-no-real-auth-modeled、movementaction-applystatustransition-state-machine 等（均追加更正） |
| CurrencyMismatchError（货币一致性服务端强制） | MOVEMENT-RULE-082 | 新规则笔记 |
| A9 Full-Redeem 现已服务端强制（原为 UI-only 已披露缺口） | 更正 MOVEMENT-RULE-020、MOVEMENT-RULE-056（原文保留，追加已解决说明） | [[A9-SG-Redemption]] |
| A7 Step-1 新增 Acceptance 余额资格闸门 | MOVEMENT-RULE-083 | [[A7-Acceptance-Settlement]] |
| Checker 独立搜索排除已 earmarked 候选 | MAKER-CHECKER-RULE-062 | earmarking-vs-earmarked-checker-queue-filter-split 等（追加更正） |
| release() 曾静默清空 reason_code 的 bug 已修复 | 无新规则 ID，追加至既有数据模型笔记 | event-snapshot-column-write-semantics-coalesce-preserve-vs-explicit-in |
| ContractVersionConflictError 死代码移除、BAL-129 测试覆盖 | 无新规则 ID | 新增 [[09-Architecture/2026-08-technical-debt-cleanups]] |
| Business Case Registry 14→29 案例、"Run All Cases" 500 三因修复、Inquire Events 栏位重建、picker false-zero-flash | 无新规则 ID（技术/测试性质，非业务规则） | 多篇 09-Architecture 笔记追加更正 |
| STATUS-RULE-030（"到期/撤销尚无对应 movementType"）已被 EXPIRE/REOPEN 实现 | 标记 SUPERSEDED，原文保留 | — |
| [[Knowledge-Gaps]] GAP-006（验证阶段）、GAP-007（萃取阶段）已被 AUTO EXPIRY / REVERSAL 的真实交付解决 | 追加"已解决"说明，原文保留 | — |
| A10 笔记内一处已过期的 Channel API functionCode CONFLICT | 追加已解决说明（channel-api.yaml v1.3.0 已补上 A10/B6/A11/B7） | [[A10-LC-Close]] |
| Phase 2 Calendar Service 统一设计 | BA 已于 2026-08-26 决定整体登记移交 Standing 微服务团队，`balance-component` 本身不修改 | 新增 Knowledge-Gaps GAP-012（记录责任归属，非待答问题） |

同步更新的索引/汇总文件：[[Business-Rule-Index]]（206→233 条规则）、[[Balance-Traceability-Matrix]]（同步新增证据行）、[[Source-to-Knowledge-Map]]（89→94 个源文件）、[[A-Import 功能索引]]／[[B-Export 功能索引]]（16→18 个功能）、[[Balance Flow Index]]、[[Balance-Knowledge-Home]]、[[Function-API Integration Map]]、[[Knowledge-Gaps]]（79→85 项）、[[Knowledge-Quality-Report]]。

## 诚实披露：本次未覆盖的范围

1. **未重新执行完整九维自评分**——[[Knowledge-Quality-Report]] 的评分表格本身仍是 2026-08-22 的原始评分，未反映新增的 27 篇规则笔记与 2 篇功能笔记。新增内容 100% 带 file:line 级 Source Evidence，但只经过单轮 BA/工程验证，未经过该框架完整的「萃取→对抗式验证」两阶段流程，不能直接假定沿用 9.5 分的 Hallucination Control/Code Traceability 评级。
2. **决策表（`11-Decision-Tables`）与测试场景索引（`10-Test-Scenarios`）未被本次同步触及**——若 A11/B7、新增校验规则需要对应条目，是下一轮同步的候选项。
3. **既有的语言一致性问题（约 298 篇笔记的小节标题仍为英文）与 `checkredeemsufficiency.md` 归档问题**未在本次处理，维持 [[Knowledge-Quality-Report]] 原整改计划。
4. 各工作分组自行发现、未能在本轮解决的具体技术性知识空白，已记录为 [[Knowledge-Gaps]] GAP-007 至 GAP-011（验证阶段编号）：REOPEN 二次重启链缺测试、B7 侧 REOPEN 缺测试、REOPEN 是否适用 Tolerance 换算不明确、REOPEN 与 CLOSE 共用资格函数在 Export EPLC_EXAMINATION 情境下是否行为一致未逐行核对、`release()` 对 `expiryDate`"是否存在"本身的重新校验与其余 4 条新规则不对称。

## 方法论说明

本次由多个独立工作分组分别核实并更新互不重叠的笔记/规则 ID 区段（避免并发写入同一份共享索引文件），每个分组在写入前都直接读取当前源代码（而非仅信任 `CLAUDE.md` 决策日志的转述）进行验证；跨分组共享的索引/矩阵/汇总文件由统筹角色在所有分组完成后一次性合并写入，避免竞态覆盖。所有笔记编辑均遵循本知识库既有的「只增补、不静默删除」纪律——过期陈述以「YYYY-MM-DD 更新」的方式追加更正区块，原文保留。

## 相关知识

- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
- [[Source-to-Knowledge-Map]]
- [[Knowledge-Gaps]]
- [[Knowledge-Quality-Report]]
- [[Balance-Knowledge-Home]]
