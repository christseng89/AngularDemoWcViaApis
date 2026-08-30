---
knowledge_id: EXPOSURE-RULE-022
title: "CONFLICT——源 Lifecycle 规格书（§4.4，以工具为单位、全有或全无）与实际上线的 Balance Component 实现（基于 MIN(单据金额, SG 未结余额) 的部分赎回）之间的 SG 解除规则冲突"
domain: Balance
category: Business Rule
status: CONFLICT
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — 分析快照中没有 .git 历史记录，参见 [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - exposure
  - conflict
---

# EXPOSURE-RULE-022 — CONFLICT——源 Lifecycle 规格书（§4.4，以工具为单位、全有或全无）与实际上线的 Balance Component 实现（基于 MIN(单据金额, SG 未结余额) 的部分赎回）之间的 SG 解除规则冲突

## 状态
CONFLICT

## 业务规则
立场 A（源设计规格书，TF_Contingent_Liability_Lifecycle §4.4）：SG 解除必须以工具为单位、全有或全无（由承运人一方事件触发 REDEEMABLE→RELEASED），明确反对任何按金额匹配的 MIN() 规则，因为那会造成永久性、且不断累积的敞口高估风险。立场 B（实际上线代码，domain/shgtRedeem.ts 及 Angular 客户端中的 A9/A3S，并由 ledger.html 自身 Notes 第 3 项佐证）：Balance Component 实际实现的是基于 MIN(Bill Amount, SG Outstanding) 推导出的 PARTIAL_REDEEM/FULL_REDEEM——恰恰是 §4.4 所反对的那条规则——依据一项在 2026-08-15 发出的明确后续业务指示，推翻了原始设计。ledger.html 参考文件本身将其记录为「一次经确认、刻意为之的偏离原始文档……而非疏漏」。

## 条件
任何 SG 赎回（A9 独立场景，或 A3S 自身的匹配腿）。

## 结果
两个来源给出了真正相反的规定；实际运行的系统遵循立场 B（基于 MIN() 的部分赎回），依据是对 domain/shgtRedeem.ts 的直接代码核查（checkRedeemSufficiency() 只检查 amount <= availableBalance，没有以工具为单位、全有或全无的关卡）以及 CLAUDE.md 决策记录中明确将 A9 锁定为「仅限 Full-Redeem」的条目（这是一项独立且范围更窄的 2026-08-21 UI 层修复，并不改变底层微服务自身仍具备的 PARTIAL_REDEEM 能力，该 CLAUDE.md 条目本身也说明此能力对任何其他直接 API 调用方依旧开放）。

## 示例
LC 100,000，首次交单 50,000，SG 55,000（依据规格书自身的算例）：规格书认为唯一合法的做法是一次性全额释放 55,000；而实际上线的微服务则会/曾经通过 MIN(50,000, 55,000) 允许对该 SG 执行恰好 50,000 的 PARTIAL_REDEEM。

## 冲突说明
> [!warning] 来源之间存在分歧
> 本次验证过程中新发现的 CONFLICT——已汇集的候选中没有一条明确指出这一分歧，但 SG 解除设计文档候选（立场 A）与另一条已知、且已披露的基于 MIN() 的实现（同时记录于 ledger.html 自身及上下文中的 CLAUDE.md 决策记录）在解除机制上直接矛盾。依据验证原则，两种立场均予以陈述，而非默默择一；需说明的是，该分歧本身已经过业务披露（并非隐藏缺陷）——见 ledger.html 自身 Notes 第 3 项——因此本 CONFLICT 针对的是「源文档与代码之间的事实分歧」，而非一个尚未解决的缺陷。

## 验证说明
本次验证过程中新发现的 CONFLICT——已汇集的候选中没有一条明确指出这一分歧，但 SG 解除设计文档候选（立场 A）与另一条已知、且已披露的基于 MIN() 的实现（同时记录于 ledger.html 自身及上下文中的 CLAUDE.md 决策记录）在解除机制上直接矛盾。依据验证原则，两种立场均予以陈述，而非默默择一；需说明的是，该分歧本身已经过业务披露（并非隐藏缺陷）——见 ledger.html 自身 Notes 第 3 项——因此本 CONFLICT 针对的是「源文档与代码之间的事实分歧」，而非一个尚未解决的缺陷。

## 原始码证据

实现：
- `TF_Contingent_Liability_Lifecycle-en.txt §4.4（grep 核实，第 899 行）`
- `analysis/contingent-liability-ledger.html Notes 第 3 项（grep 核实，第 667 行，明确称其为「一次经确认、刻意为之的偏离……而非疏漏」）`
- `CLAUDE.md 决策记录「A9（SG Redemption）锁定为仅限 Full Redeem」条目（上下文中已有，确认底层微服务的 PARTIAL_REDEEM 能力对任何其他 API 调用方保持不变）`

测试：
- （未引用直接测试证据）

## 相关知识
- [[Off-Balance-Sheet Exposure]]
- 依据证据优先级规则，当可执行代码/测试与设计文档相矛盾时，前者优先——实际上线系统的真实行为遵循基于 MIN() 的规则，而非 §4.4 的规定；不过该分歧已被明确披露并经业务确认，并非静默缺陷
- [[Business-Rule-Index]]
- [[Knowledge-Gaps]]
- [[Balance-Traceability-Matrix]]
