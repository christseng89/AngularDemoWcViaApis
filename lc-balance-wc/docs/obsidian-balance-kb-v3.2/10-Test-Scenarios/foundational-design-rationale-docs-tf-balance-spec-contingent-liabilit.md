---
knowledge_id: foundational-design-rationale-docs-tf-balance-spec-contingent-liabilit
title: "基础设计原理文档（TF Balance Spec + 或有负债生命周期）测试场景"
domain: Balance
category: Test Scenarios
snapshot_date: 2026-08-22
tags:
  - balance
  - test-scenario
---

# 基础设计原理文档（TF Balance Spec + 或有负债生命周期）测试场景

从本主题范围的测试文件中提取了11个测试场景。这些场景所证明的规则详见 Foundational Design-Rationale Docs (TF Balance Spec + Contingent Liability Lifecycle) 与 [[Business-Rule-Index]]。

| 场景 | 前置条件（Given） | 触发操作（When） | 预期结果（Then） | 来源 |
|---|---|---|---|---|
| T1 ——Sight honour 按比例适用现金保证金（cash margin），而非全额 | LC 面值 100,000，现金保证金 20%，首次提示单据（docs）50,000，tenor 为 SIGHT | 该提示单据即期兑付（honoured at sight） | 应用的保证金 = 50,000 × 20% = 10,000（而非全部 20,000 的保证金余额）——*余额影响：* DC Outstanding — Sight 从 100,000 降至 50,000；Import Bills Receivable 上升后仅按比例保证金金额净减；剩余 10,000 保证金继续保留，用于覆盖余下的 50,000，直至到期 *容差/汇率：* 无（同币种）；保证金按提用金额的固定比例直接计算 | `TF_Balance_Component_Spec-en.txt §12 T1` |
| T2 ——到期释放的时点不包含 Art. 14(c) 所述的 21 天 | LC 100,000，已提用 50,000，目前已过其自身的 expiry_date | 到期批处理流程运行 | 剩余 50,000 的或有负债恰好在 expiry_date + mail_float_grace 时释放——绝不是 expiry_date 再加 21 天——*余额影响：* DC Outstanding 剩余部分从 50,000 降至 0；剩余 ECL、限额 earmark、未实现手续费与现金保证金也在同一触发点一并释放 *容差/汇率：* 不适用 | `TF_Balance_Component_Spec-en.txt §12 T2` |
| T3/T4 ——SG 解付是分两阶段、全有或全无的单证释放 | 针对某 LC 开立了 55,000 的 SG；随后银行收到覆盖单据（50,000） | （T3）收到单据；（T4）船公司随后交回正本 SG | （T3）SG 或有负债保持不变，仍为 55,000，状态变为 REDEEMABLE，无任何 GL 变动。（T4）SG 或有负债一次性完全降为 0——不存在 5,000 的残余——状态由 REDEEMABLE 变为 RELEASED——*余额影响：* T3：无余额变化。T4：SG_OUTSTANDING 与 Customers' Liability under SG 均下降完整的 55,000，而不仅仅是 50,000 的单据金额 *容差/汇率：* 不适用 | `TF_Balance_Component_Spec-en.txt §12 T3, T4` |
| T5 ——SG 的开立使得拒付（discrepancy refusal）在经济上不再可行，LC 的覆盖部分需重新加权 | 针对覆盖某批货物的 LC 已开立 SG；随后提示的单据存在不符点（discrepant） | 对存在不符点的单据进行审核 | 依据 Art. 16 的法律拒付权在技术上仍然存在（discrepancy_refusal_economically_unavailable 标志为 TRUE，但不构成权利丧失），但 LC 的覆盖部分会被重新加权，以反映拒付在经济上已无意义——*余额影响：* LC 的覆盖部分从 20% 的贸易 CCF 重新加权，ccf_source = INTERNAL_POLICY；本事件本身不产生任何或有负债的余额变动 *容差/汇率：* 不适用 | `TF_Balance_Component_Spec-en.txt §12 T5` |
| T6 ——Acceptance 会对称地确认表内资产与负债，同时有一对被排除在表内合计之外的 MEMO_ONLY 影子分录 | 一份可承兑（available by acceptance）金额为 50,000 的 SU LC | 触发 LC_ACCEPT（银行承兑汇票） | 表内负债（Acceptances & DPU Outstanding）与表内资产（Acceptance Reimbursement Receivable）均按恰好 50,000 确认；同时会另外过账一对影子备忘分录，但不计入资产负债表合计——*余额影响：* -DC Outstanding SU 50,000；+Acceptances & DPU Outstanding（负债）50,000；+Acceptance Reimbursement Receivable（资产）50,000；对申请人的总风险敞口保持不变，仍为 100,000 *容差/汇率：* 不适用 | `TF_Balance_Component_Spec-en.txt §12 T6` |
| T7 ——针对未结清承兑的修改会被拒绝 | 某 Acceptance/DPU 头寸当前处于 OUTSTANDING 状态 | 操作员针对其尝试发起一次 amendment-decrease 类型的事件 | 该事件被直接拒绝（不变量 I8）——已承兑的汇票/DPU 只能通过 ACC_MATURE、ACC_FORCED、ACC_DISCOUNT 或 ACC_REDUCTION_CONSENTED 减少——*余额影响：* 无变化——拒绝发生在过账之前 *容差/汇率：* 不适用 | `TF_Balance_Component_Spec-en.txt §12 T7` |
| T8/T9 ——Buyer's Usance 的融资方（funding party）必须是 SELF 或 REFINANCING_BANK；APPLICANT 会被拒绝 | 正在入账一笔 Buyer's Usance LC 的 honour | （T8）使用 fundingParty = REFINANCING_BANK；（T9）操作员尝试使用 fundingParty = APPLICANT | （T8）申请人应收款与 Due to Refinancing Bank 均按总额同时入账，不会在第一天就预先入账全部 180 天的利息。（T9）APPLICANT 这一取值在校验阶段即被完全拒绝——*余额影响：* T8：+Import Usance Receivable — Applicant 与 +Due to Refinancing Bank 均按总额入账；利息随期间逐步计提，不会在第一天一次性全额入账。T9：无余额变化——在过账之前即被拒绝 *容差/汇率：* 不适用 | `TF_Balance_Component_Spec-en.txt §12 T8, T9` |
| T10/T11 ——通知（Advising）以及仅被请求但遭拒绝的保兑（confirmation）均不产生或有负债 | field 49 = MAY ADD 的出口 LC，银行拒绝保兑（T10）；或银行仅进行通知，完全未被请求/添加任何保兑（T11） | 该 LC 被通知给受益人 | （T10）尽管 field 49 请求了保兑，但由于保兑被拒绝，不会产生任何保兑或有负债。（T11）不会入账任何类别的余额——*余额影响：* T10 与 T11：均不产生或有负债、不产生任何表内资产、不产生任何类别的风险敞口 *容差/汇率：* 不适用 | `TF_Balance_Component_Spec-en.txt §12 T10, T11` |
| T12 ——未保兑议付会在出口商名下入账一笔有追索权的资产，且不涉及任何保兑释放 | 一份未保兑的出口 LC，被指定银行议付金额为 40,000 的单据 | 议付发生 | 一笔表内资产（Export Bills Negotiated — With Recourse）会以出口商为债务人（obligor）入账，recourse=TRUE；由于本就未曾产生任何保兑或有负债，因此也无需释放任何保兑或有负债——*余额影响：* +Export Bills Negotiated — With Recourse（资产，obligor=出口商）40,000 减去未实现贴现；完全没有任何或有负债侧的变动 *容差/汇率：* 不适用 | `TF_Balance_Component_Spec-en.txt §12 T12` |
| T13 ——confirmed_amount 独立于未被延伸覆盖的 LC 修改 | 已保兑的出口 LC，confirmed_amount = 100,000，lc_amount = 100,000 | 开证行将 LC 修改 +20,000，保兑行通知该修改，但并未将自身的保兑范围延伸至覆盖该增加部分 | lc_amount 变为 120,000，而保兑或有负债恰好仍保持在 100,000——这两个字段出现分歧，且或有负债仅跟踪 confirmed_amount（I13）——*余额影响：* 本事件不会导致保兑或有负债产生任何变动；只有 LC 自身记录的 lc_amount 会发生变化 *容差/汇率：* 不适用 | `TF_Balance_Component_Spec-en.txt §12 T13` |
| T16 ——Art. 16(f) 的失权（preclusion）会无人为干预地自动触发，并阻止后续的拒付尝试 | 存在不符点的单据已被提示，且已过去 5 个银行工作日，期间未送达符合规定的拒付通知 | 系统评估提示单据的计时 | LC_DOC_PRECLUDED 会自动触发（由系统生成，无需操作员操作）；此后针对同一笔提示单据尝试的 LC_DOC_REFUSE 会被拒绝——*余额影响：* 覆盖风险敞口重新加权为 100%；该提示单据此后成为强制兑付项 *容差/汇率：* 不适用 | `TF_Balance_Component_Spec-en.txt §12 T16` |
