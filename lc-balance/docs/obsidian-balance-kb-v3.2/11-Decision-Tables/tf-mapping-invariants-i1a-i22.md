---
knowledge_id: tf-mapping-invariants-i1a-i22
title: "TF Mapping ——不变式 I1A–I22"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# TF Mapping ——不变式 I1A–I22

| ID | 不变式 | 强制执行位置 | 违反后的失效表现 |
|---|---|---|---|
| I1A | 每个 posting_transaction_id、每种币别，Dr 合计须等于 Cr 合计 | 过账层 | 校验范围是整本传票，而非单一 balance_class——若按类别逐一校验，会错误拒绝一笔本就合理的「Dr 资产/Cr 负债」承兑配对 |
| I1B | 每个 undertaking_id 下的或有备忘配对（contra 对比 outstanding）金额相等、方向相反 | 过账层 + 每日控管 | 系统中成本最低的缺陷侦测手段 |
| I1C | 每个 undertaking_id 下的 MEMO_ONLY 配对必须核对一致 | 每日控管 | 影子账偏移属于影子账自身的缺陷，绝不构成调整真实记录的理由 |
| I2 | TRANSFORM 的释放动作与其配对的创建动作须在同一笔事务中提交，否则两者皆不提交 | 事务边界 | 两次过账之间的窗口期内会出现重复计数 |
| I3 | 任何或有余额都不得变为负数 | 过账层 | 过度释放会掩盖别处的滞留余额；不能替代 I16 |
| I4 | 未经明确的到期事件，任何承付责任都不得在到期+宽限期之后仍停留在 OUTSTANDING 状态 | 批次处理 + 控管报表 | 表外账簿被永久性高估 |
| I5 | 每笔 SG 都必须携带 linked_lc_id，或经批准的「无挂钩 SG」例外标记 | 事件校验 | 未挂钩的 SG 从结构上就会造成重复计数 |
| I6 | MEMO_ONLY 绝不出现在财务报表中，也不得作为 CONTINGENT/ON_BALANCE_* movement 的 FROM/TO 端 | 过账层 + 配置加载 | 影子账触及财务报表 |
| I7 | 更正记录须携带 reversal_of、maker≠checker，以及原因代码 | 事件校验 | 账簿无法被稽核 |
| I8 | Acceptance/DPU 只能透过 ACC_MATURE/FORCED/DISCOUNT/REDUCTION_CONSENTED（或对应的 CNF_ 系列）减少，绝不能透过修改（amendment） | 过账层 | 操作人员在没有任何证据轨迹的情况下核减一笔不可撤销的负债 |
| I9 | ecl_ead_factor 与 ccf_regulatory 绝不可读取自同一字段 | 构建期静态检查 | ECL 被低估五倍 |
| I10 | 监管报送只读取 ccf_source = REGULATORY 的数据 | 报送层 | 内部政策口径的头寸被当作监管规则呈报给监管机构 |
| I11 | CNF_ADD 仅在实际发出保兑通知的动作时触发，绝不依据 field 49 字段本身 | 事件校验 | 每一笔仅被「询问」是否保兑的信用证都会被入账保兑负债 |
| I12 | 到期触发逻辑绝不额外加上 UCP 第 14(c) 条的 21 天 | 批次配置校验 | 每笔到期的信用证的表外账簿都会被多计约 3 周 |
| I13 | confirmed_amount 独立于 lc_amount；或有科目跟随 confirmed_amount 变动 | 数据模型 | 每次仅通知修改但未保兑时，都会高估承付责任 |
| I14 | 跨币别结算必须透过 FX 头寸配对过账，绝不可由客户直接对 nostro 账户过账 | 过账层 | 汇兑损益消失，头寸未被对冲且不可见 |
| I15 | 幂等性：(entity, source_system, source_ref, semantic_key) 必须唯一；相同元组+相同payload 可重放，payload 不同则硬性拒绝 | 过账层 | 一次网络重试会造成重复入账增加，事后无法侦测 |
| I16 | 每次承付责任余额更新都须采用乐观版本控制或序列化机制 | 过账层 | 两笔并发的部分动用在 read-committed 隔离级别下都能通过校验 |
| I17 | 每个生效中的 L1 事件都必须精确解析出一个 movement_type，且产生 ≥1 行 L2 记录 | 构建期（L1_L2_Coverage） | 零影响事件必须被明确声明，绝不可从缺失中推断 |
| I18 | 任何配置都不得改变某事件所产生的余额科目，或其 balance_class | 配置加载 | 下游的每一条不变式/ECL/风险规则都会变成依赖框架配置的产物 |
| I19 | 列报净额处理须先通过 IAS 32.42 各项测试（按交易对手、按报告日）——绝不能仅凭配置决定 | 报送层 + 期末结账（G12） | 评估失败或缺失一律归为 GROSS，绝不按净额处理，也绝不报错 |
| I20 | 每笔过账金额都必须在评估 I1A 之前先按币别精度四舍五入 | 过账层 | 先用未四舍五入的数值校验、写入时才四舍五入，会造成永久性的账目不平 |
| I21 | 非零的四舍五入余差须过账到同一传票内指定的一条腿上 | 过账层 | 该余差绝不可被舍弃、并入第一条/最大一条腿，或跨传票结转 |
| I22 | movement 掌管 DIRECTION（方向），amount_basis_code 掌管 MAGNITUDE（大小）——NON_NEGATIVE 与 INCREASE/DECREASE 配对，SIGNED 与 DERIVED_FROM_SIGN 配对 | 构建期，关卡 G13 | 两套独立的方向信号可能导致把一次减少实现成增加 |

## Source Evidence

- `TF_Balance_Component_Mapping-en.txt lines 581-608 (Invariants sheet)`

## Related Knowledge

- Balance Figures Calculation Logic + TF Balance Component Mapping Workbook
- [[Business-Rule-Index]]
