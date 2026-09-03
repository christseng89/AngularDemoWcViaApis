---
knowledge_id: Business-Rule-Index
title: "业务规则索引"
domain: Balance
category: Index
snapshot_date: 2026-08-26
tags:
  - balance
  - index
---

# 业务规则索引

从 Balance Component 代码仓库中提取并经过对抗式验证的 233 条可追溯业务规则（220 条 CONFIRMED，3 条 INFERRED，9 条 CONFLICT，1 条 SUPERSEDED）。另有 79 项——UNCLEAR 规则、跨来源冲突，以及验证过程中标记出的缺口——未单独建立规则笔记，而是收录在 [[Knowledge-Gaps]] 中。

**2026-08-26 增量同步：** 新增 27 条规则（STATUS-RULE-031~036、MOVEMENT-RULE-063~068/075~083、MAKER-CHECKER-RULE-058~062、EXPOSURE-RULE-030），覆盖 F1 新增的 A11/B7 Reopen、AUTO EXPIRY/AUTO CLOSE 背景批次与 Grace Period、A1/B1 Expiry Date 强制必填与本国营业日校验、5 项 UI-only 必填栏位补齐服务端、真 4-eyes（MakerCheckerConflictError）、CurrencyMismatchError、A7 Acceptance 余额闸门、Checker 独立搜索排除已earmarked 候选等真实代码变更；另修正 5 条既有规则（STATUS-RULE-030 标记 SUPERSEDED，MOVEMENT-RULE-020/056、MAKER-CHECKER-RULE-001/003 追加已解决的日期化更正）。详见 [[Freshness-Update-Log-2026-08-26]]。

另请参阅：[[Balance-Traceability-Matrix]]、[[Balance Component Overview]]、Balance-Knowledge-Home。

## BALANCE-RULE (14)

另请参阅：[[Balance Derivation Rules]]

| ID | 标题 | 状态 |
|---|---|---|
| [[BALANCE-RULE-001]] | 已确认余额（Confirmed Balance）= 所有状态为 RELEASED 的变动记录（movement）的 ceilingAmount × MOVEMENT_DIRECTION 之和 | ✅ CONFIRMED |
| [[BALANCE-RULE-002]] | 可用余额（Available Balance）= 已确认余额 ± 所有 PENDING 变动记录之和；在一笔简单变动记录自身的 Submit→Release 转换过程中总额保持不变 | ✅ CONFIRMED |
| [[BALANCE-RULE-003]] | 待处理占用总额（Pending Earmark Total）= 可用余额 − 已确认余额（一个真实持久化的字段，而非仅存在于设计文档中的概念） | ✅ CONFIRMED |
| [[BALANCE-RULE-004]] | 待处理减少总额（Pending Decrease Total）只汇总同一合约上 PENDING 变动记录中的负向部分，绝不会与 PENDING 状态的增加相互抵销 | ✅ CONFIRMED |
| [[BALANCE-RULE-005]] | 面值金额（Face Amount）只追踪 RELEASED 状态的 ISSUE/AMEND_INCREASE/AMEND_DECREASE 金额，使用原始 amount 而非 ceilingAmount | ✅ CONFIRMED |
| [[BALANCE-RULE-006]] | 在余额推导过程中，无法识别的 movementType 必须显式报错，绝不能默默按零影响处理 | ✅ CONFIRMED |
| [[BALANCE-RULE-007]] | 严格可用余额（Tight Available Balance）由已确认余额（而非可用余额）推导得出，再减去待处理减少总额，再减去表外风险敞口——自 2026-08-20 / v1.13.0 起生效 | ✅ CONFIRMED |
| [[BALANCE-RULE-008]] | 各项余额（已确认／可用／严格可用）始终在查询时由变动记录历史实时推导得出，从不缓存在合约行上；openingBalance 是一个已废弃、恒为 '0' 的遗留字段 | ✅ CONFIRMED |
| [[BALANCE-RULE-009]] | 表外 SG 风险敞口的 Pending/Approved 拆分（Figures #8/#9）在构造上恰好等于表外风险敞口（Figure #4） | ✅ CONFIRMED |
| [[BALANCE-RULE-010]] | 交单占用额（Pending）+（Approved）之和，等于 EPLC_CONFIRMATION 场景下严格可用余额所减去的合计指标 | ✅ CONFIRMED |
| [[BALANCE-RULE-011]] | 客户端实时余额充足性预警分为两级：仅具备 plain-Available 逻辑的功能在 plain-Available 范围内只会退回一次到 Tight 提示；仅具备 Tight 检查的功能（B3/A8）始终显示 Tight 级别的预警，即便金额同时也超出了 plain Available | ✅ CONFIRMED |
| [[BALANCE-RULE-012]] | tightAvailableBalanceForWarning 会为 A3S（已匹配的 SG 赎回）与 B4（针对某笔交单 Present Docs 呈现的 HONOUR/ACCEPT）放宽客户端实时检查的阈值 | ✅ CONFIRMED |
| [[BALANCE-RULE-013]] | 为使 B3/A8 能够正常显示共享的余额信息框/预警，selectedContract 被别名指向 selectedParent | ✅ CONFIRMED |
| [[BALANCE-RULE-014]] | LC Master Records Index 的面值金额列（deriveLcAmount）镜像了微服务端已废弃不用的 computeFaceAmount()，仅用于展示，且有直接的单元测试覆盖 | ✅ CONFIRMED |

## EXPOSURE-RULE (30)

另请参阅：[[Off-Balance-Sheet Exposure]]

| ID | 标题 | 状态 |
|---|---|---|
| [[EXPOSURE-RULE-001]] | SHGT 表外风险敞口 = Σ(RELEASED/PENDING 状态的 ISSUE) − Σ(RELEASED 状态的赎回，加上匹配到同一 LC 上仍处于 PENDING 状态的 UTILIZE 的 businessEventId 的 PENDING 状态赎回) | ✅ CONFIRMED |
| [[EXPOSURE-RULE-002]] | checkUtilizeSufficiency（A3/A3S/B4 的 UTILIZE-HONOUR-ACCEPT）——两级硬性 ERROR：先比对 plain Available，再比对 Tight Available | ✅ CONFIRMED |
| [[EXPOSURE-RULE-003]] | SG Issue（A8）的上限为父 LC 的严格可用余额，并扣除既有的 SG 风险敞口，在合约创建之前完成检查 | ✅ CONFIRMED |
| [[EXPOSURE-RULE-004]] | 新的交单呈现（B3 EPLC_EXAMINATION CREATE）充足性检查——严格限定在父 Confirmation 经交单占用额调整后的严格可用余额之内，不享有临时消耗抵扣 | ✅ CONFIRMED |
| [[EXPOSURE-RULE-005]] | B4 仍处于 PENDING 状态的 HONOUR/ACCEPT 会临时抵扣其所引用的 B3 呈现——仅用于展示，且仅存在于 assembleSnapshot() 内部 | ✅ CONFIRMED |
| [[EXPOSURE-RULE-006]] | computePresentDocsEarmark / Pending / Approved——合计与拆分两种形式的交单占用额指标，均排除已消耗与临时已消耗的呈现 | ✅ CONFIRMED |
| [[EXPOSURE-RULE-007]] | 或有账务分录科目族查找——instrumentType 决定借/贷科目对；LC 与 Confirmation 需按 tenor 加后缀，SHGT 与 Acceptance/DPU 则不需要 | ✅ CONFIRMED |
| [[EXPOSURE-RULE-008]] | EPLC_EXAMINATION 与表内资产类 instrumentType 永远不会生成 contingentAccountEntry（单据/交单收讫不会产生任何或有 GL 影响） | ✅ CONFIRMED |
| [[EXPOSURE-RULE-009]] | 方向到借/贷的映射规则，以及 EPLC_CONFIRMATION 的 AMEND 符号折叠处理 | ✅ CONFIRMED |
| [[EXPOSURE-RULE-010]] | 无法识别的 movementType 在两个领域模块中都做了防御性处理，但处理方式不同——contingentAccountEntry 中静默返回 null，而 offBalanceExposure/sumExaminationCreates 中则抛出 Error | ✅ CONFIRMED |
| [[EXPOSURE-RULE-011]] | 一笔已 RELEASED 但尚未被消耗的交单呈现（Present Docs Presentation）会阻止出口方（B6）的 Close 资格 | ✅ CONFIRMED |
| [[EXPOSURE-RULE-012]] | View Voucher 对话框针对每笔变动记录只展示单一、不可变的借/贷科目对——从不重新计算 | ✅ CONFIRMED |
| [[EXPOSURE-RULE-013]] | A3S 自身的 SG 赎回选择器会排除任何实时可用余额为零的 SG | ✅ CONFIRMED |
| [[EXPOSURE-RULE-014]] | A3S/A9 自身在 LC 层面的 SG 余额资格提示（该 LC 是否存在任何未偿的 SG） | ✅ CONFIRMED |
| [[EXPOSURE-RULE-015]] | A3S 匹配式 SG 赎回的先后顺序：先创建 SG 赎回（PENDING），再创建带有相同 businessEventId 的 Document Arrival UTILIZE——这正是实现抵扣的机制 | ✅ CONFIRMED |
| [[EXPOSURE-RULE-016]] | 未保兑 LC 的 Acceptance 属于 MEMO 性质的风险敞口（无 accountEntries）；EBL/IBL 提前融资始终只是备注性质的步骤，从不涉及 Balance Component 的调用 | ✅ CONFIRMED |
| [[EXPOSURE-RULE-017]] | EBL（出口押汇贴现／提前融资）完全不属于 Balance Component 的范畴 | ✅ CONFIRMED |
| [[EXPOSURE-RULE-018]] | 范畴边界——Balance Component 仅覆盖或有／表外风险敞口；所有表内分录均明确不在范畴之内 | ✅ CONFIRMED |
| [[EXPOSURE-RULE-019]] | Acceptance/DPU 属于影子备忘性质，并非真正的或有科目类型——真实负债记于表内，不在本组件范畴之内 | ✅ CONFIRMED |
| [[EXPOSURE-RULE-020]] | Acceptance/DPU 在承兑发生的那一刻，就以全额方式记入表内；备忘分录对仅作为报表层面的影子记录（源规范设计依据） | ✅ CONFIRMED |
| [[EXPOSURE-RULE-021]] | SG 解除是以整份保函为单位（两阶段、要么全部要么完全不解除，经由 REDEEMABLE→RELEASED 实现），而非按 MIN(单据金额, SG 金额) 的金额匹配规则——依据源生命周期规范自身 §4.4 的设计依据 | ✅ CONFIRMED |
| [[EXPOSURE-RULE-022]] | CONFLICT——源生命周期规范中的 SG 解除方式（§4.4，以整份保函为单位、要么全部要么完全不解除）与实际上线的 Balance Component 实现（基于 MIN(Bill Amount, SG Outstanding) 的部分赎回）之间存在冲突 | ⚠️ CONFLICT |
| [[EXPOSURE-RULE-023]] | LC+SG 合并风险敞口按每笔关联装运取 MAX（经济／CCF 加权视角），而非 SUM 或简单抵扣——源规范设计依据，Balance Component 自身的 GL 并未实现该逻辑 | ✅ CONFIRMED |
| [[EXPOSURE-RULE-024]] | SG Issue 与 SG 金额增加会记入完全相同的借/贷科目对；不存在独立的 SG 修改／减少／索赔 movementType | ✅ CONFIRMED |
| [[EXPOSURE-RULE-025]] | 无论是持有到期还是贴现，B5 Settlement 都会冲销同一组影子分录对 | ✅ CONFIRMED |
| [[EXPOSURE-RULE-026]] | MEMO 类型的 exposureNature 会强制 accountEntries 为 null（服务端强制执行，API 响应与数据库设计均如此） | ✅ CONFIRMED |
| [[EXPOSURE-RULE-027]] | contingentAccountEntry / contingent_account_entry 是在变动记录创建时由服务端一次性推导并不可变地持久化，与调用方直接传入的 accountEntries 字段完全并行、彼此独立 | ✅ CONFIRMED |
| [[EXPOSURE-RULE-028]] | 父子合约关联关系（parent_logical_contract_id：SHGT/Acceptance/EPLC_EXAMINATION → 父 LC）由应用层维护，并非由数据库的 FOREIGN KEY 强制保证 | ✅ CONFIRMED |
| [[EXPOSURE-RULE-029]] | 事件快照（event_snapshot/root_event_snapshot/acceptance_event_snapshot/sg_event_snapshot）在写入时一次性计算，从不重新计算，唯一例外是 A4 完成 A3 的场景，该场景会写入独立的 finalize_* 列集合 | ✅ CONFIRMED |
| [[EXPOSURE-RULE-030]] | ACTIVE AMEND_EXPIRY_DATE 無分錄；EXPIRED Extension 在 Maker PENDING 即攜帶可供 Checker 審核的真實復原分錄 | ✅ CONFIRMED |

## MAKER-CHECKER-RULE (62)

另请参阅：[[Maker Checker Lifecycle]]

| ID | 标题 | 状态 |
|---|---|---|
| [[MAKER-CHECKER-RULE-001]] | Maker/Checker 是否为同一人的隔离要求，属于银行政策层面的关注点，本状态机并不强制执行 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-002]] | Close 资格的三层防护——选择器提示、Submit、Release 三处共用同一项检查 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-003]] | Maker 的 EC/Cancel（cancel()）与 Checker 的 reject() 是两个不同的操作——各自独立的终态动作，各自拥有独立的审计列 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-004]] | 幂等键 (balanceContractId, eventSeq)——重复提交在每一层（应用层检查、数据库竞态防护、HTTP 路由）都是无操作，只会返回原始记录 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-005]] | UNIQUE 冲突的检测是通过对错误信息做字符串匹配实现的，而非依赖稳定的错误码（已披露的局限性，BAL-120） | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-006]] | requireIssueReleased 目录筛选——Maker-ACTION 选择器会排除那些自身创建变动记录尚未通过 Checker 审批的自然键 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-007]] | POST /balance-movements 的请求校验：6 个始终必填字段（zod schema），其余字段直接透传 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-008]] | 重复 ISSUE 防护——针对一个已处于 ACTIVE 状态的自然键再次执行创建型 movementType（ISSUE/CREATE）会被 409 拒绝，绝不会被默默叠加 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-009]] | 基于 (balanceContractId, eventSeq) 的幂等创建——HTTP 层行为 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-010]] | Sight 类型 IPLC_LC/UTILIZE（A4）要求在 Checker Release 之前必须有真实的 Maker Submit——服务端强制执行，按 tenorType 限定范围（BAL-123） | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-011]] | A4 自身的 Checker Release 在客户端会被阻止，直到其自身的 Maker Submit 存在为止（纵深防御，独立于服务端的 BAL-123 门禁） | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-012]] | 幂等性信号的双重测试覆盖——通过 app.test.ts 端到端验证 NaturalKeyAlreadyExistsError（重复 ISSUE） | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-013]] | FunctionStrategy 注册表是 4 个按功能划分的行为维度（变动推导、复合提交、Checker 释放、选择流程）的唯一权威来源 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-014]] | A10/B6 Close：金额从不允许手动键入——始终从已确认余额自动填充并锁定 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-015]] | Checker 的 release 路由会因功能形态而异：原地终结（A4）、具有不同释放前状态的复合结算来源（A6 vs B4）、延迟型（A3/A3S） | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-016]] | 只有 B5 使用专门的 Settleable-Balance Index（EB Index）第二步选择器 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-017]] | resolveFunctionForMovement 对于两个功能共用的变动记录形态存在一个已知且可接受的、仅影响展示的歧义 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-018]] | payExistingUtilizeFunctionFor 会将稍后 Release 时刻的事件解析为 A4，与 A3 的 Create 事件区分开来 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-019]] | 自然键（LC/IB/SG 编号）的解析方式会因功能形态而异 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-020]] | 资格规则中的零余额排除，对 Catalog/IB-Index 选择器是按 movementType 进行门禁的，但对 Parent 选择器则是无条件的（一个既有的不对称之处，被有意保留） | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-021]] | A6/B4 必须转换一条明确指定、仍处于 PENDING 状态（对 B4 而言也可以是已 RELEASED）的源记录——绝不能凭空新建一笔无关联的 Acceptance/Honour | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-022]] | A3S 在 Submit 之前必须绑定到一份具体的装运保函（Shipping Guarantee），包括其快照 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-023]] | hasEligibleTargetSelected 会依据 Strategy 字段重新推导每个功能所需的目标形态，独立于字段取值校验 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-024]] | A1 在 Submit 时对 Tenor Days Sight/Usance 的兜底归一化处理，仅限定于功能代码 'A1'——B1 并没有等效的提交时兜底处理 | ⚠️ CONFLICT |
| [[MAKER-CHECKER-RULE-025]] | 当 LC 的 UTILIZE 分支失败时，A3S 会对 SG 赎回分支执行自动回滚（补偿性取消） | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-026]] | 主调用失败绝不会写入 submitResult（F-08 修复）——以保证 formLocked 的正确性 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-027]] | Submit 就绪门禁——已选定合格目标 + 字段有效性校验通过 + 通用的 Amount>0 检查 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-028]] | Checker Queue 中 EARMARKING/EARMARKED 的拆分——A3/A3S 会排除已被确认（acknowledged）的候选项，A4 则要求候选项既已被确认又已经过 Maker Submit | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-029]] | Checker Queue 的范围限定为所选功能自身可能产生的变动记录 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-030]] | Checker 自身的独立搜索，在次要键（IB/SG 编号）留空时，会通过目录浏览自动解析出该键 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-031]] | Checker 的 release() 会依据复合提交的形态，分派到四条分支释放链中的一条 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-032]] | 跨会话关联分支的解析，在当前会话没有内存中的记录时，会退回到基于 businessEventId/referencedTransactionId 的查找 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-033]] | reject() 与 deleteMakerPending() 在确定目标 movementId 时，优先采用 selectedCheckerMovement 而非 submitResult | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-034]] | reject() 使用硬编码的 checkerId（'checker1'）与硬编码的 reasonCode（'MANUAL_TEST_REJECT'），这与 release() 由 createdBy 推导出 checkerId 的做法不同——属于真实存在的内部代码不一致 | ⚠️ CONFLICT |
| [[MAKER-CHECKER-RULE-035]] | deleteMakerPending() 在执行任何取消操作之前都要求已知的 createdBy（BAL-132 运行时防护，而非非空断言） | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-036]] | deleteMakerPending() 会按创建顺序的逆序取消各个复合分支，主分支最后取消 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-037]] | 跨合约合并时间线按真实的事件日期/时间（eventTime）排序，从不按 eventSeq 排序 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-038]] | 单个子项的 listMovements()/catalog() 调用失败会被吞掉，绝不会导致整体合并失败 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-039]] | Look Up Current Balance 中的出口保兑 LC，会将 B3（EPLC_EXAMINATION）事件合并进 LC 标签页，其自身并没有独立的余额标签页 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-040]] | Look Up Current Balance 同样能够解析已 CLOSED 的合约——仅用于查询，并不限定只能是 ACTIVE 状态 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-041]] | A4/A6 的可支付变动记录资格要求真正完成四眼复核（EARMARKED，而非仅仅是 EARMARKING），并排除任何 A4 自身已经 Maker-Submitted 过的记录 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-042]] | B4 的跨合约候选项必须真实处于 RELEASED 状态（当 Strategy 要求时），且尚未被交单消耗 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-043]] | Maker-ACTION 选择器默认要求该自然键自身的 ISSUE/CREATE 已经过 Checker Release（requireIssueReleased 的客户端默认值） | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-044]] | checkerAct() 的动作分派决策表——依据功能形态与状态，将单个 Checker 操作按钮路由到 4 种不同的行为 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-045]] | RELEASE_SHAPED_STEP_TYPES——release/makerSubmit 两类业务用例步骤在结构上采用相同的分派方式；已移除的 'acknowledge' 步骤类型不会再出现 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-046]] | A4 的 Maker Submit 门禁体现在 Business Case Registry 自身的步骤形态中，仅限定于 Sight tenor 的进口 Document Arrival | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-047]] | 被跳过的 release/makerSubmit 步骤不会中止该业务用例的其余部分 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-048]] | 服务端幂等性、重复 ISSUE 防护以及 BAL-123 Sight-UTILIZE 的 Maker-Submit 门禁，均记录在微服务的 OAS（balance-component-api.yaml）中，与实现一致 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-049]] | 除 A1/B1 外，Channel API 对其余所有功能都禁止输入 Currency Code（仅规范层面如此——微服务尚未强制执行） | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-050]] | 设计文档中的幂等性方案——基于 (entity, source_system, source_ref, semantic_key) 四元组，配合 payload 哈希比对与硬性的 DUPLICATE_REF_PAYLOAD_MISMATCH 拒绝——在实际代码库中并未有任何实现，且在关键的 payload 不一致问题上，与已上线的 (balanceContractId, eventSeq) 行为相冲突 | ⚠️ CONFLICT |
| [[MAKER-CHECKER-RULE-051]] | 单笔非复合变动记录的通用 Submit-vs-Approved 时序模式（设计文档）——已确认/可用/严格可用三者的时序是不对称的 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-052]] | A4/A6 选择器要求真正的 EARMARKED 状态，而非仅仅是 EARMARKING（设计文档对代码层规则的重申） | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-053]] | 幂等键：重复的 (contract, event_seq) 提交会返回已有记录，而不是报错或产生重复记录（数据库设计文档重申） | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-054]] | 自然键唯一性（重复 ISSUE 防护）仅在应用层强制执行，并非由数据库约束保证——属于未来可加固的候选项 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-055]] | 上生产前必须替换：要实现真正按 LC 粒度的并发控制，需要 PostgreSQL 行级锁 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-056]] | PRAGMA busy_timeout=5000 会将锁竞争转化为一个有限等待队列，而不是立即返回 SQLITE_BUSY 失败 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-057]] | A4（Sight Settlement）的四眼复核门禁由服务端强制执行，限定范围为父合约的 tenorType === 'SIGHT'——质量报告回顾性重申 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-058]] | AUTO EXPIRY/AUTO CLOSE 以 BATCH_MAKER_ACTOR/BATCH_CHECKER_ACTOR 兩個相異系統身份分飾 Maker/Checker，套用既有、完全未修改的 assertMakerCheckerSeparation()，四眼原則不被繞過 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-059]] | CLOSE／REOPEN 的人工 Maker Submit 強制要求 reasonCode（400 拒絕空值），AUTO CLOSE 以固定內部值 NATURAL_EXPIRY_ALL_BALANCES_CLEARED 滿足此要求 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-060]] | RELEASE/REJECT 现在强制校验 Maker≠Checker——真正的 4-eyes 分离，业务已确认的反转 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-061]] | acknowledgeArrival()（A3/A3S Checker 确认）同样强制 Maker≠Checker——绕过 applyStatusTransition()，直接调用同一校验函数 | ✅ CONFIRMED |
| [[MAKER-CHECKER-RULE-062]] | Checker 独立 LC-only 搜索候选现与 Checker Queue 共享同一 isCheckerActionable() 判断——已 earmarked 的候选不再被列出 | ✅ CONFIRMED |

## MOVEMENT-RULE (77)

另请参阅：[[BalanceMovement]]

| ID | 标题 | 状态 |
|---|---|---|
| [[MOVEMENT-RULE-001]] | MOVEMENT_DIRECTION 的正负号是按 instrument/movementType 组合固定下来的 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-002]] | Sight tenor 的父 LC 会直接阻止任何子级 Acceptance CREATE | ✅ CONFIRMED |
| [[MOVEMENT-RULE-003]] | 请求的 Acceptance tenorType 必须与非 Sight 父合约自身声明的 tenorType 完全一致 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-004]] | 赎回/结算的充足性检查是针对可用余额进行的，绝不针对静态的已确认余额 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-005]] | 赎回/结算金额（在允许的情况下）可以是部分金额，且始终由 Maker 显式提交，从不从关联变动记录中自动推导 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-006]] | AMEND_DECREASE 的充足性检查是针对经容差换算后的 ceilingAmount 进行的，绝不针对原始的面值金额 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-007]] | AMEND_DECREASE 充足性检查的基准是严格可用余额，而非普通的可用余额 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-008]] | 严格可用余额下的 AMEND_DECREASE 检查被断言（此处未独立重新证明）为涵盖了面值金额不得为负的下限检查 | 🟡 INFERRED |
| [[MOVEMENT-RULE-009]] | 重复 ISSUE 防护——针对一个已处于 ACTIVE 状态的自然键执行创建型 movementType 会被拒绝 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-010]] | 重复 sourceTransactionRef 防护——在每个合约范围内唯一 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-011]] | assertValidAmount() 与 monetary amendment Amount／Tolerance no-op 的服务端兜底校验 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-012]] | Acceptance 的 Tenor 一致性由服务端在 resolveOrCreateContract() 内部强制执行，而非仅依赖客户端约定 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-013]] | AMEND（B2 共用的 movementType）——方向取决于 amount 自身的正负号；充足性检查只在真正的减少情形下才会执行 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-014]] | tenorFamily 目录筛选——没有记录 tenorType 的历史合约，在 SIGHT 与 USANCE 两种查询中都会始终被包含在内 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-015]] | 请求层对货币精度（小数位）的强制校验 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-016]] | 请求层要求 Amount 必须是合法且严格为正的 MonetaryAmount | ✅ CONFIRMED |
| [[MOVEMENT-RULE-017]] | B2（出口 LC 修改）用于展示的方向/幅度去符号化处理——AMEND_INCREASE/AMEND_DECREASE 由传输金额自身的正负号推导得出 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-018]] | 功能标签的操作图标按领域语义分组，而非按原始 movementType | ✅ CONFIRMED |
| [[MOVEMENT-RULE-019]] | B4 的 movementType 由该 Confirmation 自身的 tenorType 推导得出，从不由用户手动选择 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-020]] | A9 SG Redemption 被锁定为仅支持全额赎回，Amount 被硬锁定为该 SG 当前的可用余额 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-021]] | A3S 的单据匹配式 SG 赎回是 A9 仅限全额赎回规则的唯一合法例外——是一笔通过 businessEventId 与可识别单据绑定的真实 PARTIAL_REDEEM | ✅ CONFIRMED |
| [[MOVEMENT-RULE-022]] | A3S SG 赎回金额/类型的客户端实时预览，与实际提交到服务端的公式完全一致 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-023]] | B5 通过比较键入的 Amount 与该 Acceptance 的可用余额，推导出 FULL_SETTLE 还是 PARTIAL_SETTLE | ✅ CONFIRMED |
| [[MOVEMENT-RULE-024]] | movementTypeMatchesFunction 能够正确区分每一种 EPLC_CONFIRMATION 的 movementType——derivesMovementTypeFromTenor 分支只针对 B4 匹配 HONOUR/ACCEPT，不匹配 CLOSE | ✅ CONFIRMED |
| [[MOVEMENT-RULE-025]] | Submit Amount 校验；A2／B2 支援 Amount-only、Tolerance-only 或两者，并拒绝 no-op | ✅ CONFIRMED |
| [[MOVEMENT-RULE-026]] | B2 的方向通过 subChoice.key='amendDirection' 传递，从不通过独立的 movementType 或对 model.amount 的改动来传递 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-027]] | isAmendDecreaseDirection 这个 getter 将 A2 真实的 AMEND_DECREASE movementType 与 B2 带负号的 AMEND，统一归入同一个"减少"预警分类器之下 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-028]] | MakerSubmitService 的分派——5 种提交形态，采用首个匹配优先的路由方式，并优雅回退到普通单分支提交 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-029]] | 在选定合约/快照时自动填充金额的推导逻辑——共有 4 种不同的系统推导金额条件 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-030]] | 一笔已完成终结的 Sight tenor Document Arrival，在合并后的 Inquire Events 时间线中会拆分为一行 'create' 与一行 'finalize' | ✅ CONFIRMED |
| [[MOVEMENT-RULE-031]] | 在每一个 InquiredEvent 行阶段中，eventStatus 始终反映该变动记录真实的当前状态，绝不是被冻结的历史值 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-032]] | 处于 'finalize' 阶段的事件，会被解析为其终结功能（A4/B4），而非产生该变动记录的通用功能（A3） | ✅ CONFIRMED |
| [[MOVEMENT-RULE-033]] | 余额标签页的影响（前/后对比）只会附加在与所选事件自身账本相匹配的标签页上；同级/根标签页只展示静态快照，impact 为 null | ✅ CONFIRMED |
| [[MOVEMENT-RULE-034]] | 'finalize' 行读取的是它自身独立的 finalizeEventSnapshot（及其同级变体），当不存在时会回退到创建时刻的快照 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-035]] | 遗留回退逻辑（getBalanceAsOfMovement）仅适用于该事件自身的标签页，且仅在其持久化快照为 null 时才会启用，并针对选择项此后发生变化的情形做了竞态防护 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-036]] | 选择器自身目录的客户端分页，必须作用于已筛选合格的集合，而非服务端返回的原始数据 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-037]] | SG 赎回金额为 MIN(Document Arrival/Bill Amount, SG Outstanding Balance) | ✅ CONFIRMED |
| [[MOVEMENT-RULE-038]] | A6 复合释放顺序——源 Document Arrival 必须先于引用它的 Acceptance CREATE 被释放 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-039]] | B4 复合释放顺序——主 Honour/Accept 分支（同时也会消耗其引用的 B3 记录）会先于其关联的复合分支被释放 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-040]] | B2 的方向取决于 amount 的正负号，而非独立的 movementType——已通过真实业务用例测试数据端到端确认 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-041]] | 超出容量的面值金额/ceiling 减少会被硬性拒绝，绝不会被默默截断——一笔被拒绝的 AMEND_DECREASE 可证明地不会改变合约余额 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-042]] | 各 instrumentType 下 movementType 的合法性由调用方自行负责，微服务在通用层面并不强制执行 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-043]] | A3 与 A3S——movementType 相同（均为 UTILIZE），仅通过是否显式匹配了一份未偿 SG 来区分 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-044]] | Acceptance/DPU 绝不可能通过修改类事件被削减——一旦承兑即不可撤销（设计文档规则） | ✅ CONFIRMED |
| [[MOVEMENT-RULE-045]] | 到期释放的触发时点为 expiry_date + mail_float_grace——绝不会再叠加 UCP 600 第 14(c) 条的 21 天（设计文档规则，运行代码中未实现） | ✅ CONFIRMED |
| [[MOVEMENT-RULE-046]] | 现金保证金按提用比例分摊，绝不会在首次提用时一次性全额扣除（设计文档规则） | ✅ CONFIRMED |
| [[MOVEMENT-RULE-047]] | 保留权利付款/凭保证书付款并不构成 honour——它产生的是一笔追索性资产，而非对开证申请人的清洁应收款（设计文档规则） | ✅ CONFIRMED |
| [[MOVEMENT-RULE-048]] | 通知一份没有保兑的出口 LC，不会入账任何或有负债，也不会入账任何资产（设计文档规则） | ✅ CONFIRMED |
| [[MOVEMENT-RULE-049]] | 保兑相关的或有负债绝不能仅凭 SWIFT 第 49 栏就入账——只能基于实际通知保兑这一行为（设计文档规则） | ✅ CONFIRMED |
| [[MOVEMENT-RULE-050]] | 买方远期（Buyer's Usance）恰好只有两种融资方变体（SELF / REFINANCING_BANK）——不存在 APPLICANT 这一变体（设计文档规则） | ✅ CONFIRMED |
| [[MOVEMENT-RULE-051]] | 在未保兑 LC 下的议付，对出口商而言是一笔追索性资产；从来不曾存在任何或有负债（设计文档规则） | ✅ CONFIRMED |
| [[MOVEMENT-RULE-052]] | Document Arrival 从 Pending 迁移到 Approved，只会发生在真正的 A4/A6 Release 时刻，绝不会发生在 A3/A3S 自身的 Submit 或 Checker 确认时 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-053]] | A10/B6 的 CLOSE 金额必须精确等于当前的已确认余额，在 Submit 与 Release 两处都会重新验证 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-054]] | （TF Mapping）SG 解除是以整份保函为单位，而非以金额为单位——这正是 A9 全额赎回锁定背后的源文档依据 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-055]] | 修改功能在设计上应当创建一行新的合约版本，而非原地更新——但该机制属于死代码，实际运行的 AMEND_INCREASE/AMEND_DECREASE 流程从未调用过它 | ⚠️ CONFLICT |
| [[MOVEMENT-RULE-056]] | 通过 MIN(Bill Amount, SG Outstanding) 实现的 SG 部分赎回——ledger.html 参考文档（仍将 A9 描述为支持 MIN() 部分赎回）与后续 A9 全额赎回锁定决策之间存在冲突 | ⚠️ CONFLICT |
| [[MOVEMENT-RULE-057]] | 进口 Acceptance 对买方远期与卖方远期一视同仁——这与源规范中更严格的 BU/SU 会计拆分有所偏离（ledger.html 记录的偏离之处） | ✅ CONFIRMED |
| [[MOVEMENT-RULE-058]] | 出口 tenor 收缩为仅 Sight/Usance 两种——B4 并不区分源规范中买方远期的 'Case 1' 与 'Case 2' | ✅ CONFIRMED |
| [[MOVEMENT-RULE-059]] | B2 的 Confirm LC Amendment 使用单一的带符号增减 AMEND 类型，而非分开的 Increase/Decrease movementType——对应 Folio 4 的借/贷处理方式 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-060]] | B4 的 Usance Accept 是一次跨越 Folio 4 与 Folio 5 的复合 Release+Create，与 A6 相同的"一次 Release 同时完成两件事"模式一致 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-061]] | 修改减少（Amendment Decrease）在 Maker 提交后立即入账——并未实现受益人同意门禁（相对于 UCP 600 第 10 条，属于已记录的缺口） | ✅ CONFIRMED |
| [[MOVEMENT-RULE-062]] | Sight Honour 被建模为单一的"先 Utilize 后 Release"复合步骤（A3/A3S 创建 PENDING 占用，A4 完成终结）——并未实现"保留权利付款"这一变体 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-063]] | EXPIRE（AUTO EXPIRY）资格判定刻意不比照 CLOSE 的 SG/Acceptance 余额归零条件 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-064]] | REOPEN（A11/B7）复原金额由 computeReopenRestoreAmount() 在 Submit 时伺服端计算，反转整条尚未反转的 RELEASED EXPIRE/CLOSE 沖销链，非仅最后一笔 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-065]] | MOVEMENT_DIRECTION.REOPEN = 1：REOPEN 自 2026-08-25 起直接以自身簽署金額建立餘額，不再產生任何 REVERSAL 副作用 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-066]] | 動態反轉方向仍受支援；Expiry Extension 已改由同一筆 AMEND_EXPIRY_DATE PENDING 攜帶 EXPIRE reference 與復原分錄 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-067]] | assertValidAmount() 的「0 合法、負數拒絕」豁免自 F1 起擴及 EXPIRE 與 REOPEN，與既有 CLOSE 豁免共用同一段程式碼 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-068]] | AMEND_EXPIRY_DATE 為雙模式 movementType：對 ACTIVE 合約是單純修改到期日，對 EXPIRED 合約則是 Expiry Extension Amendment 復原入口，由合約當前狀態而非請求旗標區分 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-075]] | A1/B1 ISSUE 的 Expiry Date 由选填改为强制必填（三层防线：Angular 表单/Submit 守卫/服务端 assertExpiryDateRequired） | ✅ CONFIRMED |
| [[MOVEMENT-RULE-076]] | A1/B1 ISSUE 的 Expiry Date 必须是真实的本国（台湾）营业日——先查周末再查假日，超出 2026-2028 覆盖范围时视为「未知」而非拒绝 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-077]] | 任一创设型 movement 的 naturalKey.lcNumber 强制必填——服务端 assertNaturalKeyFieldsRequired()，Maker+Checker 双重校验 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-078]] | 按 instrumentType 强制要求 naturalKey.ibNumber 或 sgNumber——NATURAL_KEY_FIELDS_BY_INSTRUMENT 服务端镜像表 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-079]] | 指定 movementType 强制要求 sourceTransactionRef——SECONDARY_REF_REQUIRED_MOVEMENT_TYPES 服务端镜像表 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-080]] | A1/B1/A6 三组 (instrumentType, movementType) 组合强制要求 tenorType——TENOR_TYPE_REQUIRED_PAIRS 服务端镜像 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-081]] | 非 Sight 时 tenorDays 必须 > 0，服务端仅对 IPLC_LC:ISSUE（A1）强制，刻意未扩展至 B1/A6 | ✅ CONFIRMED |
| [[MOVEMENT-RULE-082]] | 货币一致性现由服务端强制校验——currency 与已解析合约（或新建子合约的父合约）自身货币不一致时抛出 CurrencyMismatchError | ✅ CONFIRMED |
| [[MOVEMENT-RULE-083]] | A7 Step 1（LC Index）新增 Acceptance 餘額資格閘門——只有名下存在未結 IPLC_ACCEPTANCE 的 Usance LC 才會出現 | ✅ CONFIRMED |

## STATUS-RULE (36)

另请参阅：[[Close Eligibility]]

| ID | 标题 | 状态 |
|---|---|---|
| [[STATUS-RULE-001]] | PENDING 是唯一拥有多个合法后续操作的状态 | ✅ CONFIRMED |
| [[STATUS-RULE-002]] | 一笔 REJECTED 状态的变动记录仍然可以被 CANCELLED 或编辑，但绝不能被 RELEASED | ✅ CONFIRMED |
| [[STATUS-RULE-003]] | RELEASED、CANCELLED 与 SUPERSEDED 均为终态 | ✅ CONFIRMED |
| [[STATUS-RULE-004]] | A10/B6 Close 资格——SG=0，Acceptance=0，整棵树中不存在任何未结事件，且尚未处于 Closed 状态 | ✅ CONFIRMED |
| [[STATUS-RULE-005]] | Close 金额必须精确等于当前已确认余额——在 Submit 与 Release 两处都会重新验证 | ✅ CONFIRMED |
| [[STATUS-RULE-006]] | Close 仅限用于根级 instrumentType（IPLC_LC / EPLC_LC / EPLC_CONFIRMATION） | ✅ CONFIRMED |
| [[STATUS-RULE-007]] | Close 释放的副作用——合约转为 CLOSED 状态，并被锁定、无法再进行后续操作 | ✅ CONFIRMED |
| [[STATUS-RULE-008]] | 根合约自身的 ISSUE 必须先被 RELEASED，才能进行任何其他操作（assertRootIssueReleased） | ✅ CONFIRMED |
| [[STATUS-RULE-009]] | B3（EPLC_EXAMINATION/CREATE）会在其自身的 Checker 操作后真实转为 RELEASED；presentDocsConsumedAt 会独立于状态字段，单独追踪 B4 后续的消耗情况 | ✅ CONFIRMED |
| [[STATUS-RULE-010]] | 每个 logicalContractId 最多只能有一个 ACTIVE 状态的合约版本（由数据库的部分唯一索引强制保证） | ✅ CONFIRMED |
| [[STATUS-RULE-011]] | (logicalContractId, contractVersion) 必须唯一 | ✅ CONFIRMED |
| [[STATUS-RULE-012]] | balance_movements 是仅追加（append-only）的——状态转换只会触及一组固定、明确命名的列 | ✅ CONFIRMED |
| [[STATUS-RULE-013]] | findByNaturalKey 在查询场景下也能解析出已 CLOSED 的合约；findActiveByNaturalKey 则始终只限定 ACTIVE 状态 | ✅ CONFIRMED |
| [[STATUS-RULE-014]] | CONFLICT：数据库设计文档将修改（Amendments）描述为"新建合约版本 + markSuperseded()"的协议，但真实的服务代码从未执行过这一流程——修改实际上是以针对现有、不变的合约版本新增变动记录的方式实现的 | ⚠️ CONFLICT |
| [[STATUS-RULE-015]] | 每一个枚举类型的列都有数据库层面的 CHECK 约束，是在应用层校验之外的纵深防御 | ✅ CONFIRMED |
| [[STATUS-RULE-016]] | 替代链与冲销链上具有自引用外键完整性约束 | ✅ CONFIRMED |
| [[STATUS-RULE-017]] | movement_type 的权威合法取值列表来自 BalanceService 的注册表，而非 types.ts | ✅ CONFIRMED |
| [[STATUS-RULE-018]] | reject()/cancel() 只有在 PENDING 状态下才是合法操作 | ✅ CONFIRMED |
| [[STATUS-RULE-019]] | 事件状态展示映射——占用类功能（A3/A3S、B3）与其他所有功能不同 | ✅ CONFIRMED |
| [[STATUS-RULE-020]] | 处于 'finalize' 阶段的行，即便 (instrumentType, movementType) 组合完全相同，也绝不会被视为占用（earmark） | ✅ CONFIRMED |
| [[STATUS-RULE-021]] | CLOSE 变动记录（A10/B6）始终以带红色徽标的 CLOSING/CLOSED 形式展示，会覆盖普通状态与占用状态两条展示轨迹 | ✅ CONFIRMED |
| [[STATUS-RULE-022]] | 状态通过图标而非仅靠颜色来传达（无障碍考量）——statusBadgeIcon() 完全由徽标的 CSS 类推导得出 | ✅ CONFIRMED |
| [[STATUS-RULE-023]] | 合约级状态徽标配色——ACTIVE 为绿色，CLOSED/CANCELLED 为红色，SUPERSEDED 为灰色，并带有 CLOSING 状态的覆盖显示 | ✅ CONFIRMED |
| [[STATUS-RULE-024]] | 只有当根合约上的 A10/B6 CLOSE 变动记录确实仍处于 PENDING 状态时，closingPending 才为 true | ✅ CONFIRMED |
| [[STATUS-RULE-025]] | 余额标签页的显示门禁：Acceptance 标签页仅在 IPLC_LC/EPLC_CONFIRMATION 根合约为 Usance tenor 时显示；SG 标签页仅在进口 IPLC_LC 下显示 | ✅ CONFIRMED |
| [[STATUS-RULE-026]] | AccountEntriesDialogComponent 的状态展示会透传自身的 `phase` 输入，确保 'finalize' 行绝不会被错误标注为 EARMARKED | ✅ CONFIRMED |
| [[STATUS-RULE-027]] | A10/B6 的 Close 资格通过一次聚合式服务端调用来解析，绝不会逐个候选项分别调用 | ✅ CONFIRMED |
| [[STATUS-RULE-028]] | CONFLICT：LC/Confirmation 的修改减少在文档中要求受益人同意门禁（UCP 600 第 10(a)/(c) 条），但实现代码中并不存在这样的门禁 | ⚠️ CONFLICT |
| [[STATUS-RULE-029]] | CONFLICT：UCP 600 第 16(f) 条的自动排除机制在文档中被描述为系统自动生成、无需人工干预的事件，但实现代码中并不存在这样的机制（定时器、计划任务或状态字段） | ⚠️ CONFLICT |
| [[STATUS-RULE-030]] | LC/Confirmation 到期与撤销的残余冲销是一项已定义的需求，但尚未实现对应的 movementType（2026-08-26 更新：已由 EXPIRE/REOPEN movementType 实现，见 [[STATUS-RULE-031]]） | 🔄 SUPERSEDED |
| [[STATUS-RULE-031]] | AUTO EXPIRY 是唯一能把合約狀態從 ACTIVE 轉為 EXPIRED 的路徑，僅由背景批次觸發，受 expiryDate + mailFloatGraceDays 日期閘門控管 | ✅ CONFIRMED |
| [[STATUS-RULE-032]] | REOPEN（A11/B7）依合約自身 expiryDate 是否仍在 Release 當下之後，把 CLOSED 合約重啟為 ACTIVE 或 EXPIRED 兩種目標狀態之一 | ✅ CONFIRMED |
| [[STATUS-RULE-033]] | Auto Close Grace Period：AUTO CLOSE 需等待 effectiveTo 之後 N 個銀行營業日（AUTO_CLOSE_GRACE_PERIOD_BUSINESS_DAYS）才會撿走一筆 EXPIRED 合約 | ✅ CONFIRMED |
| [[STATUS-RULE-034]] | isRecentlyReopened()：AUTO EXPIRY/AUTO CLOSE 均跳過最近一個掃描週期內剛被 RELEASED REOPEN 觸及的合約，時效性豁免而非永久排除 | ✅ CONFIRMED |
| [[STATUS-RULE-035]] | findExpiredByNaturalKey()／findClosedByNaturalKey()：僅 AMEND_EXPIRY_DATE／REOPEN 擁有專屬的非 ACTIVE 合約 natural-key 解析後備路徑，其餘功能仍被 ACTIVE-only 解析自動封鎖 | ✅ CONFIRMED |
| [[STATUS-RULE-036]] | EXPIRED 合約狀態徽標為琥珀色（明確區別於 CLOSED 的紅色），且 Checker Queue 搜尋對 A11/B7 需以 includeAnyStatus 覆寫解析，否則會 404 | ✅ CONFIRMED |

## TOLERANCE-RULE (14)

另请参阅：[[Tolerance Processing]]

| ID | 标题 | 状态 |
|---|---|---|
| [[TOLERANCE-RULE-001]] | Ceiling 金额公式：ceilingAmount = faceAmount × (1 + tolerancePct/100) | ✅ CONFIRMED |
| [[TOLERANCE-RULE-002]] | 容差换算的 instrumentType 适用性门禁 | ✅ CONFIRMED |
| [[TOLERANCE-RULE-003]] | 容差换算的 movementType 适用性门禁 | ✅ CONFIRMED |
| [[TOLERANCE-RULE-004]] | 双重门禁（instrumentType 且 movementType）冲突防护——防止 SHGT 自身的 ISSUE 被误判为 LC 的 ISSUE | ✅ CONFIRMED |
| [[TOLERANCE-RULE-005]] | tolerancePct 为 null/undefined 时按恒等换算处理 | ✅ CONFIRMED |
| [[TOLERANCE-RULE-006]] | tolerancePct 为 0 时同样按恒等换算处理 | ✅ CONFIRMED |
| [[TOLERANCE-RULE-007]] | EPLC_LC 在容差适用性上与 IPLC_LC 完全一致 | ✅ CONFIRMED |
| [[TOLERANCE-RULE-008]] | 严格可用余额公式（"增加从严，占用从宽"）被用于 checkUtilizeSufficiency/checkShgtIssueSufficiency/checkPresentDocsIssueSufficiency | ✅ CONFIRMED |
| [[TOLERANCE-RULE-009]] | MonetaryAmount 的传输字符串格式：最多 18 位整数、最多 3 位小数，符号可选 | ✅ CONFIRMED |
| [[TOLERANCE-RULE-010]] | 按币种强制执行的小数精度——服务端兜底处理，未知币种默认 2 位小数，已接入请求校验 schema | ✅ CONFIRMED |
| [[TOLERANCE-RULE-011]] | UCP 600 第 30(a) 条的金额容差（仅此一项）应当驱动 max_liability；第 30(b) 条的数量容差则不应驱动 | 🟡 INFERRED |
| [[TOLERANCE-RULE-012]] | 出口 Confirmation 的 confirmed_amount 独立于其所依附 LC 自身的金额（UCP 600 第 10(b) 条） | 🟡 INFERRED |
| [[TOLERANCE-RULE-013]] | checkAmendDecreaseSufficiency 会将经容差换算后的 ceilingAmount 与严格可用余额比对，而非与普通可用余额比对 | ✅ CONFIRMED |
| [[TOLERANCE-RULE-014]] | 买方远期（Buyer's Usance）仅适用于进口方融资；出口/保兑行一侧的处理必须与 Sight 完全相同——这是业务分析（BA）决策，但仅在测试夹具层面实现，领域层并没有相应的防护 | ✅ CONFIRMED |
| [[TOLERANCE-RULE-015]] | A2／B2 完整上限差额；支援 Amount-only／Tolerance-only／Both 并拒绝 no-op；新 Tolerance 在 Release 才生效 | ✅ CONFIRMED |
