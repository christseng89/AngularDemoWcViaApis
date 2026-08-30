---
knowledge_id: Knowledge-Gaps
title: "知识空白"
domain: Balance
category: Gap Log
snapshot_date: 2026-08-26
tags:
  - balance
  - gaps
  - conflicts
---

# 知识空白

以下每一项都是依据本知识库的证据准则——**绝不能把一个假设当作既定事实来转换**——而被刻意地不予断言为已确认业务规则的内容。条目类型包括：证据被判定为不充分的规则（状态为 UNCLEAR——未单独建立规则文件）、在验证阶段之前就已标记的知识空白，以及在对抗式验证阶段中标记出的知识空白。凡是 CONFLICT 状态足够明确、值得单独记录的规则，都已在 [[Business-Rule-Index]] 中建立了自己的文件并做了交叉链接；本页补充的是规则文件自身 YAML frontmatter 所承载不了的叙事说明。

## 萃取阶段标记的知识空白（73 项）

### GAP-007 (balance-core-domain)

**观察到的情况：**
MOVEMENT_DIRECTION 自身的文档注释明确说明，CANCEL、EXPIRE、REVERSAL 被刻意排除在该表之外，其中 REVERSAL 尤其需要特殊处理——它的效果是对原始变动记录符号的翻转，而不是它自己固定不变的方向——之后才能被纳入该表。

**依据来源：**
microservices/balance-component/src/domain/balanceDerivation.ts 第 5-11 行

**存在的问题：**
如果任何代码路径以 movementType 为 CANCEL、EXPIRE 或 REVERSAL 的变动记录去调用 computeConfirmedBalance/computeAvailableBalance/computePendingDecreaseTotal/computeFaceAmount，该调用将会抛出异常（依据"unrecognized movementType"这道守卫逻辑），而不会计算出任何数值——这是一种已知且已披露的不完整性，而非缺陷；但这 3 个文件本身并未验证代码库其他地方对此的实际处理方式（例如，状态为 CANCELLED 的变动记录是否真的会到达这些函数——考虑到它们只按 RELEASED/PENDING 状态过滤）。

**待确认的问题：**
REVERSAL 这个 movementType 在当前生产系统中是否真的有被使用？如果有，它"对原始记录符号取反"的逻辑究竟实现在哪里（显然不在本次读取的 balanceDerivation.ts 中）？

**2026-08-26 更新（已解决）：** 是，REVERSAL 现已在生产中真实使用——F1 新增的 Expiry Extension Amendment（AMEND_EXPIRY_DATE 作用于 EXPIRED 合约时）会以 REVERSAL 反转其指向的原始 EXPIRE/CLOSE，方向为动态解析（`reversalOfMovementId` 反查后取反），逻辑实现于 `service/balanceService.ts`。REOPEN 本身自 2026-08-25 redesign 起不再产生 REVERSAL（直接以自身簽署金額入帳）。详见 [[MOVEMENT-RULE-066]]。

---

### GAP-008 (balance-core-domain)

**观察到的情况：**
balanceDerivation.ts、statusTransition.ts 和 tenorRouting.ts 三者的文档注释都引用了"设计文档 §3.3""§4""§7"，作为它们所实现规则的出处。

**依据来源：**
microservices/balance-component/src/domain/balanceDerivation.ts 第 2 行；src/domain/statusTransition.ts 第 1 行；src/domain/tenorRouting.ts 第 2 行

**存在的问题：**
根据本仓库自身 CLAUDE.md 的决策日志记录，这些"设计文档 §N"引用指向的是一份确实存在、但从未提交进本仓库的另一份文档（并非 analysis/TF_Balance_Component_Spec-*.docx，因为后者自身的 §N 编号对不上）。因此这些被引用的章节编号无法针对任何已提交的源文件进行独立核实——本次萃取仅以代码及其测试作为证据，这也符合既定的证据优先级规则。

**待确认的问题：**
不适用——按照指示，这里仅作为"文档权威性缺口"标记，不涉及需要业务方回答的问题；依据既定的证据优先级顺序，代码与测试仍然是具有约束力的权威来源。

---

### GAP-009 (balance-core-domain)

**观察到的情况：**
EDIT 这一动作（PENDING/REJECTED -> SUPERSEDED）在 statusTransition.ts 内部有完整的定义与测试，但本次萃取过程中并未读到任何以 EDIT 动作调用 applyStatusTransition() 的调用方（不在本次任务范围内——service/balanceService.ts 不属于本次指定读取的文件之一）。

**依据来源：**
microservices/balance-component/src/domain/statusTransition.ts 第 20、24-25 行；测试文件第 9、11 行

**存在的问题：**
仅凭这 3 个文件，无法判断目前生产环境中究竟是哪个真实的用户操作（如果有的话）会触发 EDIT/SUPERSEDED，还是说这只是设计所预想、但 UI/服务层尚未开放的一种状态。

**待确认的问题：**
目前是否存在某个服务层端点或 UI 流程会调用 EDIT 动作、进而产生 SUPERSEDED 状态的变动记录？

---

### GAP-010 (balance-core-domain)

**观察到的情况：**
computePendingDecreaseTotal() 在 balanceDerivation.ts 中已存在并有文档说明，但完整的 Tight Available Balance（紧缩可用余额）计算公式（Confirmed Balance 减去表外风险敞口，再减去 Pending Decrease Total）仅在本文件自身的文档注释中被提及，说明该公式是在 balanceService.ts 的 assembleSnapshot() 和 offBalanceExposure.ts 中组装完成——而这两个文件都不在本次萃取的指定范围内。

**依据来源：**
microservices/balance-component/src/domain/balanceDerivation.ts 第 79-91 行（文档注释）

**存在的问题：**
本次萃取能够精确确认 Pending Decrease Total 这一构建模块本身，但无法在本次范围内独立地从源代码端到端验证完整的 Tight Available Balance 公式——CLAUDE.md 自身的决策日志条目对此有一致的描述，但那属于决策日志/文档层级的证据，而非该完整公式所需的最高优先级（可执行代码）证据。

**待确认的问题：**
本次范围不适用——特此标记，以便后续覆盖 service/balanceService.ts 与 domain/offBalanceExposure.ts 的萃取，能够直接对照源代码确认完整的 Tight Available Balance 公式。

---

### GAP-011 (tolerance-domain)

**观察到的情况：**
computeCeilingAmount() 返回的是 faceAmount.times(toleranceFactor) 计算出的原始 Decimal.js 结果，没有任何显式的舍入/截断步骤，把结果对齐到该币种的最小货币单位小数位数（CURRENCY_MINOR_UNITS，依据 CLAUDE.md 中"金额输入遵循所输入 Currency 自身的小数位数"这一决策）。

**依据来源：**
src/domain/tolerance.ts:66-67

**存在的问题：**
一个具有 2 位以上有效小数的 tolerancePct（例如 '12.5'）与某些金额组合，可能会得到一个小数位数超过该币种自身最小货币单位精度的 ceilingAmount。tolerance.ts 与 tolerance.test.ts 均未显示该值在被持久化或与 Available Balance 比较之前，究竟在何处、是否会被舍入。

**待确认的问题：**
ceilingAmount 是否会在之后的某个调用点（例如 balanceService.ts 或 money.ts）被舍入/截断到该币种的最小货币单位精度？如果会，使用的是哪种舍入方式（四舍五入、银行家舍入、还是直接截断）？本次萃取所读的这两个文件均无法给出证据。

---

### GAP-012 (tolerance-domain)

**观察到的情况：**
该模块自身的文档注释引用了"设计文档 §6.2"，测试文件的 describe 区块也引用了"(设计文档 §6.2)"。

**依据来源：**
src/domain/tolerance.ts:1-27；test/unit/domain/tolerance.test.ts:3

**存在的问题：**
根据本仓库自身 CLAUDE.md 的决策日志记录，这些"设计文档 §N"引用指向的是一份确实存在、却未被提交进 analysis/ 目录的另一份文档——因此 §6.2 的业务原理除了代码注释本身所陈述、以及测试所验证的内容之外，无法被独立核实。

**待确认的问题：**
这不是一个功能性的知识空白（CLAUDE.md 已经将其记录为一种已知、可接受的状态），但仍值得提醒：未来任何对 Tolerance 换算行为的规则新增/修改，都应以代码/测试为证据，而不应假定可以参照那份无法访问的 §6.2。

---

### GAP-013 (tolerance-domain)

**观察到的情况：**
没有任何测试用例覆盖了小数形式的 tolerancePct（例如 '12.5'），或格式错误／负数的 tolerancePct 字符串。

**依据来源：**
test/unit/domain/tolerance.test.ts（全文件）

**存在的问题：**
非整数或负数 tolerancePct 的行为完全依赖 Decimal.js 自身的解析/运算逻辑（new Decimal(tolerancePct)），而这在该模块的边界处从未被测试过——例如，一个负数 tolerancePct（对"仅向下调整"这种场景来说似乎合理，但这并不是 Tolerance 的真实业务场景）是会被默默接受、并产出一个低于 faceAmount 的 ceilingAmount，还是本应由上游调用方预先校验。

**待确认的问题：**
tolerancePct 是否在到达 computeCeilingAmount() 之前，已经在上游某处被校验（例如非负、量级合理）？还是说这个模块完全信任调用方？

---

### GAP-014 (exposure-domain)

**观察到的情况：**
computePresentDocsEarmarkPending() 没有 provisionallyConsumedIds 参数，也没有针对它的任何过滤逻辑，这一点与它的姊妹函数 computePresentDocsEarmark/computePresentDocsEarmarkApproved 不同。其文档注释断言这样做是安全的，理由是"这个桶里的一笔变动记录永远不可能同时具有 presentDocsConsumedAt"——也就是说，一条处于 PENDING 状态的 B3 记录不可能同时被一笔正在临时占用（provisionally-consuming）的 PENDING 状态 B4 所引用。

**依据来源：**
microservices/balance-component/src/domain/offBalanceExposure.ts:220-230（computePresentDocsEarmarkPending）

**存在的问题：**
"PENDING 状态的 B4 只能引用一条已经处于 RELEASED 状态的 B3，绝不会引用一条仍处于 PENDING 状态的 B3"——这一不变式仅在本文件自身的注释以及 CLAUDE.md 决策日志中关于 B4 的挑选器（picker）可选性门槛的论述里被断言，本次读取的这两个文件中并没有任何代码对其加以强制或证明（实际的 picker/eligibility-gate 代码位于本次萃取范围之外的文件，例如 document-arrival-hints.service.ts / balanceService.ts，二者均未在本次读取范围内）。

**待确认的问题：**
是否存在服务端（而不仅仅是客户端 picker 过滤）的守卫逻辑，用以阻止一次 B4 HONOUR/ACCEPT 动作被创建时，其 referencedTransactionId 指向一条仍处于 PENDING（尚未经 B3 Released）状态的 EPLC_EXAMINATION 记录？如果没有这样的守卫，在注释所假设"不可能发生"的场景下，computePresentDocsEarmarkPending 可能会出现少算的情况。

---

### GAP-015 (exposure-domain)

**观察到的情况：**
UtilizeSufficiencyResult 的 ok:true 分支仍带有一个可选的 `warning?: MovementWarning` 字段，其自身的文档注释说明当前代码从未真正填充过它——保留该字段仅仅是因为 OAS/数据库 schema 中仍然保留着它（根据 CLAUDE.md 自身 v1.15.0 变更日志条目，这一点已经被标记为遗留、并非有效在用的字段）。

**依据来源：**
microservices/balance-component/src/domain/offBalanceExposure.ts:259（UtilizeSufficiencyResult 类型）

**存在的问题：**
经确认这是有意为之、已披露的死代码，并非真正尚未解决的知识空白——收录在此仅为了完整记录本次所读到的内容，而不代表需要就此做出决策。

**待确认的问题：**
无——CLAUDE.md 自身的决策日志已将其视为已解决事项（"有意保留下来的遗留死代码……并非规格缺陷"）。本次萃取无需采取任何行动。

---

### GAP-016 (redemption-close-domain)

**观察到的情况：**
shgtRedeem.ts 自身的文档注释说明，共用的 outstandingCapped 检查同样覆盖了新增资产侧工具（EPLC_DUE_FROM_ISSUING_BANK / EPLC_ACCEPTANCE_REIMB_RECEIVABLE / EPLC_EXPORT_BILLS_DISCOUNTED）上的 REIMBURSE/RECLASSIFY_OUT，balanceService.ts 的注册表也将这些 movementType 路由到同一个处理函数——但本次任务读取范围内的文件，都不包含专门针对 REIMBURSE 或 RECLASSIFY_OUT 的可执行测试。

**依据来源：**
microservices/balance-component/src/domain/shgtRedeem.ts 第 1-6 行；microservices/balance-component/src/service/balanceService.ts 第 249-250 行

**存在的问题：**
无法通过一个可通过的测试独立确认：Available Balance 的计算基础在这两种资产侧 movementType 上是否表现正确（相对于测试覆盖良好的 SHGT/Acceptance 而言），只能确认结构上的接线复用了同一个函数。

**待确认的问题：**
在这项任务 6 个文件的读取范围之外，微服务测试套件的其他地方是否存在专门覆盖 REIMBURSE/RECLASSIFY_OUT 充足性检查的 Jest 测试？

---

### GAP-017 (redemption-close-domain)

**观察到的情况：**
CLAUDE.md 的决策日志记录显示，A9（仅 Angular 参考客户端）经业务分析（BA）确认并锁定为仅支持 Full Redeem，微服务自身的 PARTIAL_REDEEM 能力和 checkRedeemSufficiency() 被明确保持不变，对任何其他直接调用 API 的调用方而言仍然接受 Partial Redeem。shgtRedeem.ts 自身的文档注释（本次任务仍读取的源文件）依旧将部分赎回描述为一种预期内、受支持的业务场景（Import LC Case 4）。

**依据来源：**
CLAUDE.md 决策日志条目"A9（SG Redemption）锁定为仅 Full Redeem"；microservices/balance-component/src/domain/shgtRedeem.ts 第 7-14 行

**存在的问题：**
这并非严格意义上的 CONFLICT（CLAUDE.md 已明确披露该项仅限于 UI 层的范围限制），但领域层规则（"赎回可以是部分的"）与某一特定渠道（A9）的实际行为如今出现了分歧——仅阅读 shgtRedeem.ts 的读者不会知道 Partial Redeem 在 A9 渠道被 UI 层锁定禁用。

**待确认的问题：**
这种仅限 UI 层的锁定，是打算永久保留、并作为已披露的权衡取舍，还是预期未来某次萃取/开发也会在微服务/API 层限制 PARTIAL_REDEEM，以求一致？

---

### GAP-018 (redemption-close-domain)

**观察到的情况：**
amendDecrease.ts 的文档注释断言了一个代数证明：只要 tolerancePct ≥ 0，单一的 Tight-Available 检查即可涵盖一个独立的、"面值不得为负"下限检查。本次任务的读取范围内，并不包含 amendDecrease.ts 专属的 Jest 测试文件（也不包含针对 tolerancePct 为负数这一边界情况的测试）。

**依据来源：**
microservices/balance-component/src/domain/amendDecrease.ts 第 1-14 行

**存在的问题：**
仅凭已读文件，无法独立验证 tolerancePct 是否在校验层的其他地方（例如 CLAUDE.md 中 BAL-116 条目所引用的 zod schema）被保证为非负——而这正是该证明成立所需的前提条件。

**待确认的问题：**
tolerancePct ≥ 0 是否由请求校验（例如 CLAUDE.md 的 BAL-116 条目所引用的 zod schema）强制执行？是否存在测试确认"tolerancePct 为负数"这一情形是不可达的、或能被安全处理？

---

### GAP-019 (balance-service-orchestration)

**观察到的情况：**
resolveOrCreateContract() 中针对"重复 ISSUE"的守卫逻辑，仅在 `if (contract && req.naturalKey && this.movementTypeRegistry[req.movementType]?.isCreating)` 条件下才会触发，要求请求中必须带有 req.naturalKey。如果调用方改为通过一个明确的 req.balanceContractId 来引用同一个已处于 ACTIVE 状态的合约（movementType 为 ISSUE、且不带 naturalKey），该守卫就会被跳过——而 assertRootIssueReleased 对同一次调用也会被跳过，因为它自身的条件明确排除了 `req.movementType === 'ISSUE'` 的情形。

**依据来源：**
balanceService.ts:871-900（resolveOrCreateContract；重复 ISSUE 守卫位于第 886-892 行，root-issue 检查位于第 898-900 行）

**存在的问题：**
一个提供 balanceContractId + movementType ISSUE、指向一个已处于 ACTIVE 状态的根合约的调用方，似乎能够同时绕过重复 ISSUE 守卫和 root-issue-released 守卫——从而有可能在同一份合约上、以一个新的 eventSeq 创建并随后 Release 第二条 ISSUE 变动记录。ISSUE 本身没有充足性检查（movementTypeRegistry 中 ISSUE 条目使用的是 noCheck），而 MOVEMENT_DIRECTION 很可能将每一次 ISSUE 都视为固定的 +1，这将导致 Confirmed Balance 被重复计入。balanceService.test.ts 中没有任何测试覆盖这一条基于 balanceContractId 的重复 ISSUE 路径（只测试了基于 naturalKey 的路径），因此无法确认这在实践中是否真的可达（参考 UI 从不会构造出这样的请求），还是说上游某一层已经阻止了它。

**待确认的问题：**
是否存在任何真实的调用路径（UI、Business Case Runner，或未来的某个集成）会以一个指向已处于 ACTIVE 状态合约的显式 balanceContractId 提交 movementType 为 ISSUE 的请求？如果存在，resolveOrCreateContract() 的守卫是否应该扩展到也覆盖 balanceContractId 这条路径？还是说这被视为一个可接受的信任边界（只有基于 naturalKey 的创建才算真正的 Maker 动作；一旦带上 balanceContractId 就意味着调用方已经清楚并明确打算操作该合约）？

---

### GAP-020 (balance-service-orchestration)

**观察到的情况：**
MovementSufficiencyOutcome 的 ok:true 分支带有一个可选的 `warning?: MovementWarning` 字段，createMovement() 将 `sufficiency?.warning` 灌入到被持久化的变动记录的 `warnings` 字段中——但根据本文件自身的审阅者注释（在 CLAUDE.md 决策日志中也有相同表述），checkUtilizeSufficiency() 在当前代码中从未真正返回过 warning，只会返回 ok/error。

**依据来源：**
balanceService.ts:76-79（MovementSufficiencyOutcome 类型）；balanceService.ts:1040-1041（warnings 的派生逻辑）

**存在的问题：**
`warnings` 字段及其相关接线，在类型层面是活跃可用、并被类型系统所验证的，但在实践中似乎永久处于"死"的状态——当前每一个 checkSufficiency 的实现，要么只返回不带 warning 的 ok:true，要么返回带 error 的 ok:false。这与 OAS 决策日志自身的说明一致，即 BalanceMovement.warnings 是"TypeScript 一侧遗留下来的死代码，并非规格缺陷"——因此这是一个已知、已披露的状况，而非新发现的问题；但这意味着未来任何单独阅读 balanceService.ts 的架构师，都不应假定 `warnings` 是当前一个会被填充、具有实际意义的字段。

**待确认的问题：**
无——仅为完整性而标记；CLAUDE.md 的决策日志已经将其视为已定案事项（有意保留的死字段，而非需要关闭的知识空白）。

---

### GAP-021 (db-store-types)

**观察到的情况：**
validation/requestSchema.ts 自身的文档注释提到了一个完整的 "CreateMovementRequest" 形状（naturalKey、balanceContractId、tolerancePct、tenorType、parentLogicalContractId、sourceTransactionRef 等），而这个 zod schema 有意对其原样透传、不做校验；但本次范围内的文件中并未找到该类型本身的定义（本次范围内只定义了 BalanceMovement，那是持久化/响应的形状，未必与请求形状完全一致）。

**依据来源：**
microservices/balance-component/src/validation/requestSchema.ts:1-17

**存在的问题：**
无法独立确认 .passthrough() 条款所要覆盖的完整字段集合，因为其所对照的请求类型定义位于本次范围之外（很可能在 balanceService.ts 或 routes/balanceMovements.ts 中）。

**待确认的问题：**
是否在别处（例如 service/balanceService.ts）存在一个 CreateMovementRequest 类型定义，应该与本 schema 的必填字段清单做交叉核对，以确认没有遗漏？

---

### GAP-022 (db-store-types)

**观察到的情况：**
money.ts 的 CURRENCY_MINOR_UNITS 表被描述为"手工"逐一镜像 Angular 应用自身的 CURRENCY_DECIMALS 表——依靠人工纪律来保持同步，而不是通过自动化的跨项目检查（这一点与 InstrumentType/movementType 的漂移检测不同，后者依据 CLAUDE.md 自身的决策日志，有专门的 instrument-type-contract.spec.ts）。

**依据来源：**
microservices/balance-component/src/money.ts:46-62

**存在的问题：**
本次范围内没有任何测试文件验证 CURRENCY_DECIMALS/CURRENCY_MINOR_UNITS 这两张表长期保持一致；未来若只修改其中一侧而未同步修改另一侧，本次范围内的任何测试都不会检测到。

**待确认的问题：**
在本次范围之外的 Angular 测试套件中，是否存在一个类似于 instrument-type-contract.spec.ts 的、专门的货币小数位契约测试？还是说手工同步确实是唯一的保障手段？

---

### GAP-023 (db-store-types)

**观察到的情况：**
BalanceMovementStore 的幂等冲突检测，是通过匹配所抛出错误的 .message 字符串是否符合 /UNIQUE constraint failed/，而不是匹配一个稳定的错误代码，原因是 node:sqlite 并不暴露这样的代码，其自身的文档注释也说明这是一个刻意的、已披露的选择（在 CLAUDE.md 决策日志中也被记为 BAL-120）。

**依据来源：**
microservices/balance-component/src/store/balanceMovementStore.ts:193-211

**存在的问题：**
这并非一个未经证实的事实（它已被直接证实、并已作为一项延后处理的限制被披露，不属于需要新调查的知识空白），但仍值得作为一个残留的脆弱点标记出来：如果 node:sqlite 自身抛出错误的文本信息在未来某个 Node 版本中发生变化，这套检测逻辑会悄无声息地失效（退化为"直接重新抛出"，从而表现为一个非预期的错误，而不是优雅地返回幂等重复提交的响应）。

**待确认的问题：**
在后续支持的某个更新的 Node 版本中，node:sqlite 是否提供了更新的 API（例如一个稳定的 .code / .errcode 属性），可以用来替代这种基于错误文本的匹配、使其更加稳健？

---

### GAP-024 (routes-api-e2e)

**观察到的情况：**
AMEND（B2 自身的 movementType）在别处（CLAUDE.md 决策日志）被记录为豁免于金额正负号检查——只有恰好为零才会被拒绝，负数不会——但本次任务实际读取的请求校验测试部分（app.test.ts:1800-1885、2416-2444）只针对普通的 ISSUE 变动记录测试了 0/负数金额的拒绝逻辑。

**依据来源：**
test/unit/app.test.ts:2416-2444（仅测试了 ISSUE）；CLAUDE.md 决策日志"服务端 Amount 必须 > 0 的兜底检查"

**存在的问题：**
仅凭本次在 routes/app.test.ts 中读到的证据，无法直接确认"AMEND 配以负数金额会被接受、而 AMEND 配以恰好为 0 的金额会被拒绝"——这条规则仅通过 CLAUDE.md 决策日志和领域层的服务代码被 CONFIRMED，本次所读的文件中并没有路由层的 HTTP 测试作为证据。

**待确认的问题：**
在 app.test.ts 或其他地方，是否存在一个 HTTP 层级的测试，会以负数金额 POST 一条 AMEND（EPLC_CONFIRMATION，B2）并确认返回 201，同时另有一条以金额 '0' 确认返回 400 的测试？

---

### GAP-025 (routes-api-e2e)

**观察到的情况：**
ContractVersionConflictError（409 CONTRACT_VERSION_CONFLICT）在 errors.ts 中已定义，但本次任务所读的 app.test.ts 部分并未观察到任何触发它的地方。

**依据来源：**
src/errors.ts:42-46

**存在的问题：**
无法从 routes+e2e 的证据中确认，究竟是什么样的请求形态才会真正触发这个错误类，也无法确认目前是否还有任何路由/服务路径会抛出它（它可能是早期一版 (logicalContractId, contractVersion) 重复检测设计留下的遗留代码路径）。

**待确认的问题：**
CONTRACT_VERSION_CONFLICT 目前是否仍可通过任意 HTTP 请求触发？如果可以，是什么触发了它？（本次萃取范围内的文件未覆盖这一点。）

---

### GAP-026 (routes-api-e2e)

**观察到的情况：**
CLAUDE.md 的决策日志说明，assertValidAmount() 也会在 release() 中作为一道纵深防御的兜底检查被调用（"预期在 createMovement() 自己创建的变动记录上，永远不会真正触发"）——这意味着一个不合法的金额，理论上也可能在 Release 阶段触发 409/400，而不仅仅是在创建阶段。

**依据来源：**
CLAUDE.md 决策日志，"服务端 Amount 必须 > 0 的兜底检查"

**存在的问题：**
在本次任务覆盖到的 app.test.ts 部分中，没有找到/读到任何专门针对这个 release() 阶段金额兜底检查的 HTTP 层级测试（routes/balanceMovements.ts 第 26-30 行中，/release 路由的校验只检查了 releasedBy 是否存在）。

**待确认的问题：**
一条通过直接写数据库、或以其他带外方式插入的、金额为 0 的 PENDING 变动记录，在 release() 时是否真的会返回 409/400？返回的具体错误代码/状态码是什么？

---

### GAP-027 (angular-model)

**观察到的情况：**
本次萃取任务所声明的范围（Focus 列表）中，明确列出了 'secondaryReferenceForEvent()' 作为要从 balance-component.model.ts 中萃取的函数之一。

**依据来源：**
任务指示（Focus 列表）对照 /home/claude/balance-kb/repo/src/app/transaction-builder/balance-component.model.ts 全文（共 690 行）及其 spec 文件全文（共 897 行）的完整阅读结果

**存在的问题：**
balance-component.model.ts 及其 spec 文件中，根本不存在一个名为 secondaryReferenceForEvent（或行为与之相符）的函数。根据本仓库自身 CLAUDE.md 的决策日志（"Look Up Current Balance 自身的 Event Timeline……Secondary Ref. 列"），secondaryReferenceForEvent() 实际上是一个模块级的自由函数，位于 inquire-events.service.ts，而不是本文件——CLAUDE.md 自己也说明 LookUpPanelService.secondaryReferenceFor() 与 InquireEventsService.secondaryReferenceFor() 都委托给了那里的实现。

**待确认的问题：**
本次萃取任务的范围是否原本也应包含 inquire-events.service.ts（一个独立的文件、独立的萃取批次，不在实际交给本次代理的范围内）？还是说 Focus 列表只是从另一份范围描述中误复制过来的？由于从未读取该文件，本次萃取对 secondaryReferenceForEvent 的实际行为不做任何断言。

---

### GAP-028 (angular-model)

**观察到的情况：**
displayStatus() 与 statusBadgeClass() 中由 acknowledgedAt 驱动的 EARMARKED 与 EARMARKING 分支（第 4/5 个参数）在源代码中完整存在（第 544-560、617-631 行），并在文件自身的文档注释以及 CLAUDE.md 决策日志中都有详尽记录。

**依据来源：**
balance-component.model.ts:544-631，对照 balance-component.model.spec.ts（已全文搜索）

**存在的问题：**
这份 spec 文件针对 displayStatus()/statusBadgeClass() 的测试套件（第 811-845 行的 describe 区块）只覆盖了 CLOSE 类型变动记录这一特殊情形——本文件中没有任何测试直接以 acknowledgedAt 参数调用 displayStatus() 或 statusBadgeClass()，以确认这两个展示层函数在 EARMARKED 与 EARMARKING 分支上的表现（isEarmarkFunction() 本身测试充分，但这两个徽章/标签函数对 acknowledgedAt 参数的具体消费方式，在本文件中未经测试）。覆盖情况也许存在于本次萃取文件清单之外的另一个 spec 文件中（例如 maker-panel 或 checker-panel 的 spec）。

**待确认的问题：**
displayStatus()/statusBadgeClass() 中 acknowledgedAt 相关的分支，是否在 Angular 测试套件的其他地方有测试覆盖？还是说这确实是这一具体行为的一处真实覆盖缺口？该规则本身仍然是 CONFIRMED（可直接在可执行代码中读到），但本次萃取只能引用代码本身作为证据，而不能引用本次所读两个文件内的测试作为证据。

---

### GAP-029 (angular-model)

**观察到的情况：**
displayMovementAmount() 的文档注释声明，它"同样可以用于 ceilingAmount——Tolerance 换算只会缩放数值、绝不会翻转符号，因此这一函数对二者都能一致地去除符号"。

**依据来源：**
balance-component.model.ts:677

**存在的问题：**
本 spec 文件中没有任何测试真正以 ceilingAmount 形态的值去调用 displayMovementAmount()（只测试了普通的 amount 值），以在实践中确认这一论断。

**待确认的问题：**
这不是一个缺陷——之所以标记，仅仅是因为文档注释中的论断，比本文件自身测试所展示的范围更广；在 ceilingAmount 这一具体用例上，应视为 INFERRED（推断得出），而非经测试 CONFIRMED。

---

### GAP-030 (angular-function-catalog)

**观察到的情况：**
buildFields() 中实时生效的 Formly Sight/Usance Tenor-Days 表达式同时适用于 A1 与 B1（`selectedFunction?.code === 'A1' || selectedFunction?.code === 'B1'`），但 validateSubmit() 对同一规则在提交时的兜底检查（Sight 强制 tenorDays=0，Usance 要求 >0）却只检查了 `selectedFunction?.code === 'A1'`。

**依据来源：**
submit-rules.ts:100-106 对照 builder-fields.ts:139-150

**存在的问题：**
B1（Confirm LC）同样声明了 tenorTypeOptions（EXPORT_TENOR_OPTIONS），因此在 Sight/Usance Tenor Days 上与 A1 面临相同的问题，但在提交（Submit）时却没有任何服务端等效的客户端兜底逻辑对其加以强制——只有那个实时 UI 表达式，而 submit() 自身从不依据它来做门控（依据本文件自身的文档注释，"submit() 从不依据 form.valid 来做门控"）。

**待确认的问题：**
B1 在 validateSubmit() 兜底逻辑中的缺失，究竟是有意为之（例如已由其他守卫覆盖，或 B1 的流量风险较低），还是一个应该修复、以在 B1 上镜像 A1 自身补丁/拒绝逻辑的真实知识空白？

---

### GAP-031 (angular-function-catalog)

**观察到的情况：**
PARENT_INSTRUMENT_OPTIONS 正上方的文档注释写道："对于 EPLC_ACCEPTANCE，父项可以是 EPLC_CONFIRMATION（已保兑 -> ACTUAL）或 EPLC_LC（未保兑 -> MEMO，设计文档 §6.2 出口信用证）"，但实际的对象字面量定义的是 `EPLC_ACCEPTANCE: ['EPLC_CONFIRMATION']`——只有一个父项选项，而不是两个。

**依据来源：**
balance-component.model.ts:80-96（PARENT_INSTRUMENT_OPTIONS）对照其自身第 81 行的文档注释

**存在的问题：**
如果"以未保兑信用证为父项（MEMO 风险敞口）的 EPLC_ACCEPTANCE 路径"仍是一个真实、意图保留的业务场景，那么当前已注册的任何函数或父项选项条目都无法到达它——该注释描述了一种代码本身不（再）提供的能力。

**待确认的问题：**
EPLC_ACCEPTANCE 对应的 EPLC_LC 父项选项，是在某个时点被有意从 PARENT_INSTRUMENT_OPTIONS 中移除了（使得文档注释已经过时），还是说这确实是一个真实的知识空白——即一份未保兑出口信用证自身的 Acceptance 路径，目前在这个 UI 中确实无法触达？

---

### GAP-032 (angular-function-catalog)

**观察到的情况：**
genericFallback 规则的 `gatedByMovementType` 标志保留了一处有文档记录的既存不对称：Catalog/IB-Index 挑选器只会在递减类的 movementType 下排除 Available Balance 为 0 的候选项，而 Parent 挑选器则无论 movementType 是什么都会无条件地排除它。

**依据来源：**
eligibility-rule.ts:28-40

**存在的问题：**
源代码注释将其描述为"重现共享抽取之前的第一/第二种形态"——也就是说，为了向后兼容原样保留下来，而不是被确认为正确的业务行为。对于"为什么 Parent 挑选器的目标即便处于余额为 0 的 Increase/Create 情形下也应始终被排除，而 Catalog 挑选器的目标在同一 movementType 类别、余额为 0 的情况下却没问题"，源代码并未给出任何业务上的解释。

**待确认的问题：**
Parent 挑选器"无条件排除余额为 0"这一行为，是否曾经过业务确认为有意为之？还是说这只是 `filteredParentCatalog` 在被共享抽取之前手工实现时碰巧形成的样子，从未有人质疑过其中的不对称？

---

### GAP-033 (angular-maker-flow)

**观察到的情况：**
maker-panel.component.ts 中的文档注释引用了确切的服务端公式（例如 checkUtilizeSufficiency 的 SG 轧差顺序、checkUtilizeShapedSufficiency 对非信用证合约将 offBalanceExposure 置零），这些公式实际位于 balanceService.ts/offBalanceExposure.ts 中。

**依据来源：**
maker-panel.component.ts:774-808 文档注释

**存在的问题：**
本次萃取的范围仅限于 maker-panel.component.ts / maker-submit.service.ts 及其 spec 文件——实际的服务端领域文件在本次并未重新读取，因此这些公式是本次任务基于文档注释（以及同样源自同一团队的 CLAUDE.md 决策日志）而信任的，并未在本次范围内独立地对照源代码重新验证。

**待确认的问题：**
是否应由后续针对 microservices/balance-component/src/domain/offBalanceExposure.ts 的萃取，独立确认这些确切的轧差公式？

---

### GAP-034 (angular-maker-flow)

**观察到的情况：**
checksAgainstTightAvailable / checksAgainstPlainAvailable / tightAvailableBalanceForWarning 均被 maker-panel.component.html 中的 *ngIf 表达式所消费，而该模板文件本次并未读取。

**依据来源：**
maker-panel.component.ts:358-408（仅 getter 的定义）

**存在的问题：**
这些 getter 的存在、计算逻辑，以及文档注释所描述的意图均已确认，但确切的模板接线方式（究竟哪个 *ngIf 门控哪一块 DOM，以及是否与文档注释精确吻合）本次未经独立验证。

**待确认的问题：**
maker-panel.component.html 的实际模板接线，是否与这些 getter 所记录的意图完全吻合、没有任何漂移？

---

### GAP-035 (angular-maker-flow)

**观察到的情况：**
MakerSubmitService.submit() 的分派条件引用了 `deriveFunctionStrategy(ctx.selectedFunction)` 及其 `compoundSubmission.possibleShapes` / `movementDerivation.amountVsAvailableDerivation` 字段，这些定义于本次未读取的 function-strategy.ts 中。

**依据来源：**
maker-submit.service.ts:7、67-84

**存在的问题：**
除了测试文件中 A3S/B4/B5 的 fixture 数据可以推断出的范围之外，每种 possibleShapes 取值究竟适用于哪些具体函数的完整集合，在本次未能独立对照 function-strategy.ts 自身的注册表进行确认。

**待确认的问题：**
除 A3S/B4/B5 之外，是否还有其他函数的 FunctionStrategy 也设置了这些 compoundSubmission 形状之一，是本次萃取可能遗漏的？

---

### GAP-036 (angular-maker-flow)

**观察到的情况：**
rollbackArrivalSgRedeem() 中的回滚失败提示信息，告知用户"到 A9 自身的 Checker 面板中查找该 SG"作为人工兜底方案。

**依据来源：**
maker-submit.service.ts:132-150

**存在的问题：**
A9 自身 Checker 面板的实际行为（处于这种孤立、无法自动取消状态下的赎回记录，在那里是否真的可查、可拒绝）本次未经验证——只有 checker-panel.component.ts/checker-actions.service.ts 才能确认这一点，而这两个文件本次均未读取。

**待确认的问题：**
A9 的 Checker 面板是否真的能够拒绝一笔在自动回滚失败后仍停留在 PENDING 状态的 SG 赎回？

---

### GAP-037 (angular-checker-flow)

**观察到的情况：**
release() 将 checkerId 派生为 ctx.createdBy === 'maker1' ? 'checker1' : 'checker2'，而 reject() 无论 ctx.createdBy 是什么，始终传入字面量 'checker1'。

**依据来源：**
checker-actions.service.ts:151-159，对照 checker-actions.service.ts:49-50

**存在的问题：**
一笔由某个 Maker 创建、其 createdBy 在 release() 中本应映射为 'checker2' 的变动记录，如果改为被拒绝（reject），则会被记录为 checkerId='checker1'——这在两个 Checker 动作之间形成了不一致的操作人身份轨迹，且没有任何注释说明这是否有意为之。

**待确认的问题：**
reject() 是否刻意始终归属于 'checker1'（例如出于设计考虑，因为拒绝是一条独立的工作流），还是应该像 release() 一样根据 ctx.createdBy 来派生 checkerId？

---

### GAP-038 (angular-checker-flow)

**观察到的情况：**
reject() 始终传入字面量字符串 'MANUAL_TEST_REJECT' 作为拒绝原因，调用方没有任何方式提供真实的原因。

**依据来源：**
checker-actions.service.ts:155

**存在的问题：**
这个原因字符串读起来像是一个被硬编码进生产代码路径的占位符/测试值——目前无法记录任何真实的业务拒绝原因（例如由 Checker 输入的备注）。

**待确认的问题：**
'MANUAL_TEST_REJECT' 究竟是一个真实、有意固定的原因代码，还是早期开发遗留下来、本应改为暴露一个真实拒绝原因输入框的 TODO？

---

### GAP-039 (angular-checker-flow)

**观察到的情况：**
该方法自身的文档注释说明，其仅按 movementType 匹配的做法，"仅在每个候选 movementType 都专属于某一种工具、且至多只有一条已关联的变动记录能够匹配"的前提下才是安全的——这是一个靠约定来保证、而非由任何运行时检查来强制的假设；一旦该假设被打破，.find() 会悄无声息地返回第一个匹配项。

**依据来源：**
checker-actions.service.ts:233-249（resolveLinkedMovementId 文档注释）

**存在的问题：**
如果未来的某项改动，为同一个 businessEventId 引入了第二条共享相同 movementType 的关联记录，那么错误的变动记录就有可能被悄悄地解析出来，并被 release/acknowledge，而不会有任何错误被暴露出来。

**待确认的问题：**
resolveLinkedMovementId 是否应该增加一道防御性检查（例如，当匹配到多个候选项时直接失败），而不是纯粹依赖这一份文档记录的不变式永远成立？

---

### GAP-040 (angular-inquire-lookup)

**观察到的情况：**
仓库中并不存在 look-up-panel.service.spec.ts 文件（在本批次这 5 个文件旁边，只找到了 inquire-events.service.spec.ts、inquire-events.component.spec.ts、account-entries-dialog.component.spec.ts、balance-snapshot-box.component.spec.ts）。

**依据来源：**
look-up-panel.service.ts（全文件）

**存在的问题：**
LookUpPanelService 自身的行为（runLookup、syncFrom、切换标签页、loadUnderLookupCandidates 在单一候选项时的自动选中逻辑、lcInstrumentTypeFor 映射）在本次萃取范围内没有专属的单元测试文件可以作为 CONFIRMED 测试证据引用——其正确性只能从源代码本身、以及（根据 CLAUDE.md）transaction-builder.component.*.spec.ts 内部的覆盖推断得出，而后者不在本次任务的指定文件清单内。

**待确认的问题：**
LookUpPanelService 自身的测试覆盖，是否位于一个本次批次未匹配到的、命名不同的 spec 文件中？还是说确实只能通过 TransactionBuilderComponent 自身的 spec 间接覆盖？如果只是间接覆盖，是否应该有一个专属的 look-up-panel.service.spec.ts，以与 InquireEventsService 自身的专属 spec 保持对等？

---

### GAP-041 (angular-inquire-lookup)

**观察到的情况：**
selectEvent() 无条件地将 ownImpact 计算为 {before: movement.balanceBefore, after: movement.balanceAfter}（不依据状态派生），而 BalanceSnapshotBoxComponent 自身的模板将 impact.after === null/undefined 视为"仍处于 PENDING——在被 Released 之前尚未产生影响"的信号。

**依据来源：**
inquire-events.service.ts:507-515，对照 balance-snapshot-box.component.html:11-17

**存在的问题：**
关于 balanceBefore/balanceAfter 究竟"在什么时候"才会被填充这条确切的业务规则（即，依据 CLAUDE.md 决策日志自身的表述——"在变动记录仍处于 PENDING 期间两者都为 null"），仅由 BalanceSnapshotImpact 的一处文档注释所断言，本次萃取的文件范围内并未直接对照 balanceService.ts 自身的写入路径重新验证。

**待确认的问题：**
（在本次范围之外的 balanceService.ts 中）确认 balanceBefore/balanceAfter 只在 Release 时才写入，从不在 Create 时写入——本次萃取仅基于该文档注释将其视为 CONFIRMED，而文档注释在证据优先级中属于第 5 级（源代码注释），并非可执行的写入路径本身。

---

### GAP-042 (angular-pickers-shell)

**观察到的情况：**
picker-selection.service.ts 中 Step-2 的加载逻辑（loadSgsForArrival、loadSettleableBalances）在调用 api.catalog() 时明确将第 8 个参数 `requireIssueReleased` 传为 `true`，但 document-arrival-hints.service.ts 中结构相似的 loadChildHints() 与 loadSgBalanceEligibility() 调用 api.catalog() 时只传了 6 个位置参数，完全省略了这个标志。

**依据来源：**
picker-selection.service.ts:104、203；document-arrival-hints.service.ts:104、176

**存在的问题：**
仅凭本次所读的文件，无法确认这些"提示计算"调用在 API 层是悄悄继承了某个不同（或缺失）的 requireIssueReleased 默认值——如果该默认值与 `true` 不同，一张提示映射表就有可能把一个尚未 Issue-Released 的子合约计为符合资格，而对应的 Step-2 挑选器（明确传了 true）却会正确地将其排除，从而产生一条承诺了某个候选项、但挑选器自身却根本不会展示的提示。

**待确认的问题：**
BalanceComponentApiService.catalog() 中被省略的第 8 个参数（requireIssueReleased）自身的默认值是否就是 `true`？如果不是，"提示 vs. 挑选器"之间的这种不一致，是有意为之（提示刻意宽松一些），还是一个未被注意到的知识空白？

---

### GAP-043 (angular-pickers-shell)

**观察到的情况：**
picker-selection.service.ts 的 selectSettleableBalance() 在为 B5 自身的 EB Index 挑选构造一个合成 BalanceContract 时，硬编码了 `status: 'ACTIVE'` 字段，无论底层真实合约当前的实际状态是什么。

**依据来源：**
picker-selection.service.ts:241-255

**存在的问题：**
由于 loadSettleableBalances() 只会填充那些已经过滤为 Available > 0、且 requireIssueReleased:true 的候选项，这一点在实践中很可能是无害的——但这种硬编码意味着，如果真实合约的状态在"加载候选列表"与"实际选中"之间发生了竞争性变化（例如另一个会话中通过 A10/B6 Close 关闭了它），任何读取这个合成对象自身状态字段的逻辑都不会察觉到这一点。

**待确认的问题：**
挑中一笔在此期间已被 Closed/Superseded 的可结算余额，是否存在真实风险？如果存在，本次范围之外是否有后续的服务端检查，会在任何变动记录被创建之前真正捕获到这一点？

---

### GAP-044 (angular-pickers-shell)

**观察到的情况：**
TransactionBuilderComponent.isCheckerCompoundOwnSubmission 自身的文档注释说明，它的第 4 个（兜底）分支——同时匹配 submitResult.movementId 与 'confirmationHonourWithReceivable'——"在当今任何真实函数下都不可达"，因为 settlesDocumentArrival 在 B4 上是无条件的，总是会先行匹配。

**依据来源：**
transaction-builder.component.ts:272-273

**存在的问题：**
这是已被确认的死代码，保留在一张原本驱动真实复合式 Release 路由的决策表中——本身不是缺陷，但值得确认它是为未来某个函数而有意保留的，还是仅仅已经过时。

**待确认的问题：**
这个兜底分支是为即将到来的某个函数形态而预留的，还是应该在下一次触碰这个方法时被移除？

---

### GAP-045 (business-case-registry)

**观察到的情况：**
决策日志记载，该注册表通过恰好新增 7 条条目——import-case-8、import-case-9、import-case-10、import-case-11、export-case-8、export-case-9、export-case-10——"从 14 条增长到了 21 条"。而实际代码及其自身可通过的测试（businessCases.test.js 的 EXPECTED_IDS/长度断言）显示了 23 条案例——该注册表还包含 import-case-12 和 export-case-11，这两条并未在那条决策日志条目中被提及。

**依据来源：**
CLAUDE.md 决策日志（"Balance-Component-Test-Case-Proposal.md §4"条目），对照 backend/data/businessCases.js / backend/test/businessCases.test.js

**存在的问题：**
CLAUDE.md 中没有任何决策日志条目记录 import-case-12（针对 Import 侧的"Acceptance 未结清余额为负的 Close 门槛"）或 export-case-11（同一负值门槛的 Export 侧）的业务原理——两者都已存在于代码中，测试也很完整，明显是同一个"§4 A10/B6 Close 可行性"计划的延伸，但它们的新增日期晚于、或被遗漏在了那条日志条目之外。

**待确认的问题：**
import-case-12/export-case-11 的后续决策日志条目，是从未被写过，还是这两条案例是在一次更早的/并行的批次中新增的、而那次批次自身的日志条目在本文件中缺失？无论哪种情况，CLAUDE.md 中注册表的案例数量声称应从"21"更正为与代码相符的"23"。

---

### GAP-046 (business-case-registry)

**观察到的情况：**
TraceStep.type 在 Angular 客户端中被声明为 'createMovement' | 'release' | 'snapshot' | 'note' 这几种取值，但后端实际上还会产生 type:'makerSubmit' 的追踪记录（RELEASE_SHAPED_STEP_TYPES 包含 makerSubmit；import-case-1/6/10 等多个案例都用到了它，server.test.js 与 runCase.test.js 都直接对 {type:'makerSubmit', ...} 这一追踪形状做了断言）。

**依据来源：**
src/app/business-case-runner/balance-case-api.service.ts（TraceStep.type），对照 backend/server.js + backend/data/businessCases.js

**存在的问题：**
这是后端实际的追踪步骤词汇表与 Angular 客户端所声明类型之间一处真实的类型漂移。由于该组件的 rowClass()/statusText()/detailText() 使用的是 if 链而不是穷举式 switch，一条 makerSubmit 步骤不会导致崩溃，但会悄悄地落入通用分支（例如 statusText() 的兜底逻辑 `${step.status ?? ''} ${step.ok ? 'OK':'ERROR'}`，而不是任何针对 makerSubmit 的显式文案）——没有针对该步骤类型的专属视觉呈现，未来任何朝穷举式 switch 方向的重构，都会因此出现类型错误或渲染错误。

**待确认的问题：**
TraceStep.type 缺少 'makerSubmit' 这个字面量，究竟是一处有意的简化（在展示层面把它当作 'release' 处理），还是应该通过拓宽该联合类型、并加入显式处理来修复的疏漏？

---

### GAP-047 (business-case-registry)

**观察到的情况：**
注册表中的每一个 businessEventId 值都是一个纯粹硬编码的字符串（例如 `${lc}-b01`、`${lc}-honour`），在 createMovement 请求体中原样直接传递——编排层（server.js）对这个字段完全没有做任何校验、生成或匹配逻辑；它是纯粹透传的数据。

**依据来源：**
backend/data/businessCases.js（businessEventId 字段的贯穿使用）

**存在的问题：**
该字段所支撑的实际服务端语义（A3S 轧差、B4 的临时占用轧差等，均在 CLAUDE.md 中有记录）完全存在于本次萃取范围之外的微服务 balanceService.ts 中。businessCases.js 或 server.js 本身都不会强制某个案例的 businessEventId 配对在语义上是正确的——一次打错的引用复用、或两条不相关的记录意外共享了同一个字符串，都会在这些文件中悄无声息地改变轧差行为，而不会报出任何错误。

**待确认的问题：**
这不是所读文件中的缺陷，但值得标记为一处范围边界：本注册表中每一个 businessEventId 配对的正确性，完全依赖人工编写时的纪律，加上（范围之外的）微服务自身的领域测试，而不是任何可以从 businessCases.js/server.js 本身验证的东西。

---

### GAP-048 (api-specs)

**观察到的情况：**
两份 OAS 文件在端点描述和 schema 字段描述中，反复引用了一份未提交的"设计文档 §N"（依据微服务自身 package.json 的说明，该文档在仓库中并不存在）。

**依据来源：**
balance-component-api.yaml 第 4-17 行（顶层描述），以及 paths/schemas 各处数十处内联的"(设计文档 §N)"引用

**存在的问题：**
归因于该设计文档的章节级论断（例如"设计文档 §6.1""§3.3 GL Ownership""§7 Tenor"）无法针对任何已提交的来源进行独立核实——只有 OAS 自身复述的文字内容是可核查的。

**待确认的问题：**
是否存在这份设计文档可找回的副本？还是说，依据本仓库自身 CLAUDE.md 的决策日志，两份 OAS 文件中每一处"(设计文档 §N)"引用都应被纯粹当作历史归因来看待，没有独立可核实的路径？

---

### GAP-049 (api-specs)

**观察到的情况：**
balance-component-channel-api.yaml 的 servers 区块说明，参考用的 Angular 客户端是直接调用微服务 API 的，并没有经过一个已构建完成的渠道层——本文件"规定的是意图中的渠道契约……而不是（目前）一个真正在运行的服务"。

**依据来源：**
balance-component-channel-api.yaml 第 118-120 行

**存在的问题：**
与微服务 API（在 v1.0.0 到 v1.16.0 之间被反复对照真实运行中的实现重新校准，每一次都修正了通过检视发现的漂移）不同，渠道 API 显然从未被对照一个真正在运行的实现进行检验，因此其所陈述的规则（例如确切的 400/409 响应形状、schema 层面的币种强制校验）都只是设计意图，而非既定事实。

**待确认的问题：**
渠道 API 应该被当作与微服务 API 同等权威的业务规则文档来看待，还是应该被标记为一个置信度更低/带有愿景性质的层级，直到有一个真正的渠道服务能够对照它进行验证？

---

### GAP-050 (api-specs)

**观察到的情况：**
BalanceMovement.lmtsReservationId 的文档说明是"实际的 LMTS 调用机制尚未对照源代码进行追溯——这个字段只是一个占位式的透传字段"。

**依据来源：**
balance-component-api.yaml 第 1398-1406 行

**存在的问题：**
这个字段本应支撑的 LMTS Reserve/Confirm/Release 补偿模式虽然被提及，但其实际的集成行为尚未定义/未经验证。

**待确认的问题：**
LMTS 集成是否仍在计划之中，还是这个字段已经永久性地变成了遗留字段（就像已被移除的 MovementWarning schema 一样）？

---

### GAP-051 (api-specs)

**观察到的情况：**
ContractStatus.SUPERSEDED 与 MovementStatus.SUPERSEDED 在各自的枚举中都被声明，且都带有明确的文档注释，说明目前没有任何端点会把任何记录迁移到这些状态（版本化/迭代机制和"就地编辑"的 PATCH 流程均已被确认从未实现、并已在 v1.0.0 从契约中移除）。

**依据来源：**
balance-component-api.yaml 第 1218-1238、155-167 行（v1.0.0 REMOVED 清单）

**存在的问题：**
两个枚举值，加上 BalanceMovement.supersededMovementId/reversalOfMovementId 字段，纯粹作为"为未来预留"的占位符而存在，如今没有任何东西会真正填充它们。

**待确认的问题：**
这些为未来保留、当前不可达的状态/字段，是否应该被标记为可以从 schema 中移除，直到版本化/反冲功能真正被构建出来，以避免消费方为一个永远不会发生的状态编写分支逻辑？

---

### GAP-052 (api-specs)

**观察到的情况：**
微服务自身对 BalanceMovement.movementType 的描述写道："本服务自身并不在服务端强制执行按 instrumentType 划分的允许列表；那种合法性映射的所有权归调用方所有。"

**依据来源：**
balance-component-api.yaml 第 1361 行

**存在的问题：**
任何绕过渠道 API 的调用方（渠道 API 的全部职责就是从一个具名业务函数派生出合法的 instrumentType+movementType 组合）都可以直接向微服务提交一个非法组合、而不会遭到任何仅基于合法性的服务端拒绝——只有行为层面的分桶运算（方向/充足性）才可能顺带捕获到某些误用情形。

**待确认的问题：**
这是一个可接受的信任边界（微服务有意保持工具无关性，合法性强制执行属于上一层的职责），还是一个值得后续在服务端增加白名单机制来弥补的真实完整性知识空白——特别是考虑到本应提供这层守卫的渠道 API 自身并非一个正在运行的服务（参见前一条知识空白）？

---

### GAP-053 (api-specs)

**观察到的情况：**
ChannelError 自身的描述说明，CURRENCY_MISMATCH "在正常使用下有意设计为通过本渠道不可达……但仍收录在内以求完整，因为底层微服务仍然可能抛出它"。

**依据来源：**
balance-component-channel-api.yaml 第 804-817、377-381 行（POST /channel/transactions 409 响应）

**存在的问题：**
渠道客户端究竟在什么情况下真的能够看到这个错误，规定得比较松散（"仅当一个绕过本渠道的直接微服务调用方产生了一条真正冲突的记录时才会浮现出来"）——渠道层是应该转译/抑制它，还是应该在那种边界情形下原样透传，目前并不明确。

**待确认的问题：**
渠道 API 是否应该记录一个真正能通过渠道触发此响应的具体场景（例如两个渠道客户端之间的竞争）？还是应确认这纯粹是防御性文档，没有真实的触发路径？

---

### GAP-054 (api-specs)

**观察到的情况：**
GET /balance-contracts/catalog 记录了一条排序方面的业务说明（"pickup 时 Order by Reference"），但对于 GET /balance-contracts/close-eligible、GET /balance-movements?businessEventId=（记录为"最先创建的排最前，按创建顺序"）或 GET /balance-contracts/{id}/movements（记录为"最新的排最前"），都没有相应的排序规则说明。

**依据来源：**
balance-component-api.yaml 第 562-569、616-631、703-729、841-853 行

**存在的问题：**
各个列表端点之间的排序约定并不一致（catalog = 按自然键升序；movements = 最新在前；businessEventId 查询 = 最旧在前），且 close-eligible 自身的排序规则完全未作说明。

**待确认的问题：**
close-eligible 的排序规则，是单纯继承自 catalog 自身"按参考号升序"这一约定（两者都是"挑选器"类端点），还是确实未作规定/由具体实现决定？

---

### GAP-055 (design-docs-spec)

**观察到的情况：**
这两份文档使用的是一套与实际 Balance Component 代码库自身枚举完全不同、也远更细粒度的数据模型和词汇表：事件代码如 LC_ISSUE/LC_ACCEPT/SG_ISSUE/CNF_ACCEPT/EX_NEGOTIATE，余额类型如 LC_CUSTOMER_LIABILITY/ACCEPTANCE_DPU_OUTSTANDING/DUE_FROM_ISSUING_BANK，一套 ContractStatus 状态机（DRAFT→ISSUED→AMENDED→PARTIALLY_UTILISED/FULLY_UTILISED→CLOSED / EXPIRED→CLOSED / CANCELLED→CLOSED），以及诸如 undertaking_availability × financing_structure × funding_party 这样的维度——这些都无法与实际的 InstrumentType（IPLC_LC/EPLC_LC/IPLC_ACCEPTANCE/EPLC_ACCEPTANCE/SHGT/EPLC_CONFIRMATION/EPLC_EXAMINATION）、ContractStatus（ACTIVE|SUPERSEDED|CLOSED|CANCELLED）或 TenorType（SIGHT|BUYERS_USANCE|SELLERS_USANCE|DP|DA）枚举干净地对应起来。

**依据来源：**
TF_Balance_Component_Spec-en.txt 与 TF_Contingent_Liability_Lifecycle-en.txt 全文

**存在的问题：**
CLAUDE.md 已经将这一点记录为一项已确认的、已知的不匹配（这些设计文档自身的 §N 引用，指向的是一份确实存在、但从未提交的另一份文档，与源代码注释中"设计文档 §N"引用所指的并非同一份）。本次萃取是在这一认知前提下提取业务原理的，但这意味着以上所列的具体规则（例如完整的事件目录、确切的总账科目名称、精确的状态机）都不应被假定为字面意义上实现于当前代码库中、且未经过单独核实——它们所解释的是"为什么"当前系统的简化枚举会是这个样子，而不是对它们的字面 1:1 规格说明。

**待确认的问题：**
是否存在（或应当创建）一份映射文档，把这套通用引擎的词汇表（event_code、balance_type、undertaking_availability/financing_structure/funding_party）翻译到实际代码库的 InstrumentType/MovementType/TenorType 上，以便未来针对源代码的萃取，能够准确引用这些设计文档规则中哪些确实已经实现、哪些属于有意简化而省略？

---

### GAP-056 (design-docs-spec)

**观察到的情况：**
该设计文档明确、反复地反对任何"以金额为依据"的 SG 解除担保方式（"为什么不能用 SG Redemption = MIN(单据金额, SG 未结清余额)……这会在整个组合上造成持续增长的永久性高估"），坚持解除担保必须仅以票据/单证为依据（承运人交还、书面解除、B/L 交回），必须全额、无残余、分两个阶段（先 REDEEMABLE 再 RELEASED），在"单据收到"这一阶段不产生任何总账变动。而 CLAUDE.md 记录的实际实现中，A9 是"以金额为依据"的——"仅限 FULL_REDEEM，金额受保护（等于该 SG 自身的 Available Balance）"，A3S 自身的对冲式赎回腿则使用 MIN(单据金额, SG 可用余额)。

**依据来源：**
TF_Contingent_Liability_Lifecycle-en.txt §4.4，对照 CLAUDE.md 自身"A9（SG Redemption）锁定为仅 Full Redeem"条目

**存在的问题：**
目前尚不清楚实际的 shgtRedeem.ts/A3S 机制是否真的满足这份设计文档所要求的"以票据为依据的解除担保"这一意图（例如，因为赎回金额始终只由重新推导出的 Available Balance 驱动，而不是原始单据匹配；同时假定现实世界中的承运人放货始终与一次 Maker/Checker 赎回动作一一对应），还是说这是一处已披露的简化处理，偏离了本设计文档"绝不按金额匹配、始终以票据/全额为依据"这条更严格的规则。本次萃取无法访问 shgtRedeem.ts/A3S 源代码，因此无法就此加以验证。

**待确认的问题：**
实际的 A9/A3S SG 赎回机制（以金额为依据、锚定于 Available Balance）究竟是真正实现了这份设计文档"以票据为依据的解除担保"这一原则，还是一处已知、可接受、但应被明确记录为偏离（而非默认视为等价）的做法？

---

### GAP-057 (design-docs-spec)

**观察到的情况：**
这些设计文档要求分别、可独立寻址地输出五个数值——accounting_balance、ead_economic、ecl_ead、ead_regulatory、limit_utilisation——外加一个用于区分 REGULATORY 与 INTERNAL_POLICY 两种 CCF 处理方式的 ccf_source 字段，并要求一份强制性的月度对账桥接报告，以及一条强制性不变式（I10）：监管报表永远不得读取 ead_economic。

**依据来源：**
TF_Balance_Component_Spec-en.txt §8.5"五个风险敞口数值"，以及 §10.2/§10.3（ead_economic/ead_regulatory/CCF/ccf_source）

**存在的问题：**
仅凭本次萃取所能获取的材料（只有这两份设计文档），无法判断实际的 Balance Component 微服务是否计算或对外提供这五个独立的风险敞口数值中的任何一个、一个 ccf_source 字段、或任何对账桥接报告——CLAUDE.md 自身对已交付系统的描述，集中在 Confirmed/Available/Tight Available Balance 与 Face Amount 上，这看起来是一个窄得多的子集，聚焦于操作层面的余额跟踪，而非完整的监管/经济风险敞口汇总。

**待确认的问题：**
完整的五数值风险敞口模型（以及 CCF/ccf_source 的监管与内部区分）是否本就在 Balance Component 的范围之内？还是说这明确不在范围之内（该组件按照 CLAUDE.md 自身所述的范围边界，只负责跟踪或有负债余额，CCF/监管资本计算留给一个独立的下游系统去处理）？

---

### GAP-058 (design-docs-spec)

**观察到的情况：**
该设计文档要求，每一次开证/修改事件都要计提一笔"表外信用风险敞口拨备"（IFRS 9 ECL），对属于金融担保范畴的工具采用"ECL 拨备与未摊销手续费两者取高"的计量方式，并要求 Stage 1/2/3 分级，且要求在包括仅涉及期限变更、金额无变动的每一个事件上都重新计算。

**依据来源：**
TF_Contingent_Liability_Lifecycle-en.txt §9.3 和 §2.1(2)——IFRS 9 ECL"取高者"计量方式与 Stage 1/2/3 拨备

**存在的问题：**
CLAUDE.md 对实际 Balance Component 的描述中，任何地方都没有出现 ECL/拨备的概念、字段或事件（该组件的范围被明确表述为跟踪或有负债/风险敞口，而不是会计/总账过账）——尚不清楚 IFRS 9 ECL 拨备计算是有意不在本微服务的范围之内（由某个读取本账本的独立风险/拨备系统负责），还是一项确实尚未构建的需求。

**待确认的问题：**
IFRS 9 ECL/拨备计算是否明确不在 Balance Component 的范围之内（委托给下游的风险引擎处理）？还是说这是本设计文档中一项尚未被处理、应作为未来工作被追踪的需求？

---

### GAP-059 (design-docs-figures-mapping)

**观察到的情况：**
该设计文档将幂等性（(entity, source_system, source_ref, semantic_key) 永久唯一，payload 不匹配时硬性拒绝并返回 DUPLICATE_REF_PAYLOAD_MISMATCH）与乐观版本并发控制，视为第一阶段、不可协商的账本核心不变式（I15/I16），并明确警告称，日后再补做这些机制，将需要重新打开每一条写路径。

**依据来源：**
TF_Balance_Component_Spec-en.txt §5.4 幂等性 以及 I15/I16（幂等性 + 乐观并发）

**存在的问题：**
CLAUDE.md 单独记录了实际系统的幂等机制为"幂等键（§8）(balanceContractId, eventSeq)，通过 UNIQUE 约束实现"，外加"BAL-120：幂等冲突检测仍采用文本匹配方式，因为 node:sqlite 没有稳定的约束错误代码——已延后处理，不视为知识空白"——比起这份设计文档的 I15，这是一套明显更简单的机制（没有独立的 source_system/source_ref/semantic_key/payload_hash 四元组，也没有记录任何与 DUPLICATE_REF_PAYLOAD_MISMATCH 等效的"payload 不匹配即硬性拒绝"路径）。

**待确认的问题：**
对于这套系统实际的集成面（仅限 UI/API，而非多渠道的 SWIFT/批量重放），这套更简单的 (balanceContractId, eventSeq) 幂等键，是否被认为已充分、有意地缩小实现了这份设计文档的 I15 不变式？还是说，更完整的 source-system/source-ref/payload-hash 模型是一项已知的未来知识空白？

---

### GAP-060 (design-docs-figures-mapping)

**观察到的情况：**
TF_Balance_Component_Mapping-en.txt 描述了一整套总账过账引擎——保证金计提、手续费递延/摊销、ECL 拨备、外汇重估、往来账结算、以及总账余额不变式 I1A/I20/I21——而 CLAUDE.md 自身的范围边界表述则说明 Balance Component"跟踪的是风险敞口，而不是结算/总账过账；那是 Payment/Charge Component 的职责"。

**依据来源：**
TF_Balance_Component_Mapping-en.txt 第 1-17 行（README Scope）、第 192-413 行（L2_Balance_Movement 自身的保证金/手续费/ECL/外汇/往来账步骤），对照 CLAUDE.md 的"范围边界"段落

**存在的问题：**
目前不清楚这份工作簿描述的是当前已实现的微服务、一个未来/目标状态的设计，还是一个更广义的参考架构，而这个具体的 Balance Component 只实现了其中一部分。

**待确认的问题：**
TF_Balance_Component_Mapping 是否仅仅是一份目标状态/原理性文档（依据其自身 README 所说的"the why"），而并不预期本仓库的微服务实现总账过账不变式 I1A/I20/I21，或保证金/手续费/ECL/外汇过账步骤？

---

### GAP-061 (design-docs-figures-mapping)

**观察到的情况：**
该工作簿自身的事件/变动词汇表（LC_ISSUE、LC_AMD_INC、SG_ISSUE、CNF_ADD、CNF_ACCEPT，以及 movement 取值 POST/MEMO_ONLY/BATCH_RECALC/STATUS_ONLY/NO_BALANCE_EFFECT/MIRROR）与 CLAUDE.md 中记录的实际代码库 InstrumentType/MovementType 枚举（IPLC_LC/EPLC_LC，ISSUE/AMEND_INCREASE/UTILIZE/HONOUR/ACCEPT，MovementStatus PENDING/RELEASED 等）对不上。

**依据来源：**
TF_Balance_Component_Mapping-en.txt 第 131-413 行（L1_Event_Catalogue / L2_Balance_Movement），对照 CLAUDE.md 的"InstrumentType"/"MovementStatus"枚举清单

**存在的问题：**
仅凭这两份文档，无法判断该工作簿的 event_code 分类法，是与实际已实现的 movementType 取值 1:1 对应、是一个覆盖了确实不在本微服务范围内功能的超集，还是属于后来被重新命名的另一代设计。

**待确认的问题：**
除了 CLAUDE.md 已经确认的唯一一条 Rule #1（SG discharge）交叉引用之外，是否存在一份文档，把该工作簿的 event_code 词汇表（LC_ISSUE、SG_REDEEMABLE、CNF_ACCEPT 等）映射到本仓库实际的 InstrumentType/MovementType 配对上？

---

### GAP-062 (design-docs-figures-mapping)

**观察到的情况：**
L1_L2_Coverage 与 GL_Coverage 两张工作表（对应 G1/G2/G2B/G10/G13 等门槛）的"Value"（数值）列完全是空白的——每一行"Check"（例如"过账侧完整性校验失败的 L2 行数（必须为 0）"）都没有记录任何结果。

**依据来源：**
TF_Balance_Component_Mapping-en.txt 第 450-464 行（L1_L2_Coverage）、第 521-537 行（GL_Coverage）

**存在的问题：**
这些被描述为"会阻断构建"/"会阻断上线"的实时公式门槛，但转换后的文本显示没有任何计算出的数值——无法从这份文档判断这些门槛目前是通过、失败，还是从未被运行过。

**待确认的问题：**
G1 与 G2/G2B/G10/G13 这些门槛，是否曾经真正针对这个具体的微服务实现被评估执行过？如果有，结果是什么？

---

### GAP-063 (design-docs-figures-mapping)

**观察到的情况：**
该工作簿的不变式 I15 要求幂等性以 (entity, source_system, source_ref, semantic_key) 为键，而 CLAUDE.md 自身的决策日志记录了实际实现的幂等键是 (balanceContractId, eventSeq)，通过一个数据库 UNIQUE 约束实现（§8，服务编排）。

**依据来源：**
TF_Balance_Component_Mapping-en.txt 第 601 行（I15），对照 CLAUDE.md 的"服务编排"章节（"幂等键（§8）(balanceContractId, eventSeq)，通过 UNIQUE 约束实现"）以及 BAL-120 决策日志条目

**存在的问题：**
这是两种结构上完全不同的幂等键形态——一个是四段式的外部消息元组，一个是两段式的内部合约/序号对——尚不清楚二者是要在不同层面表达同一个不变式，还是确实是两套不同（且可能不完整）的机制。

**待确认的问题：**
实际的微服务是否在任何地方实现了类似 I15 自身"payload 哈希比对"（相同元组、不同 payload 即硬性拒绝）的行为？还是说 (balanceContractId, eventSeq) 是一个更窄的、代码原生的替代方案，从未与该工作簿自身的 I15 定义做过对照核实？

---

### GAP-064 (design-docs-figures-mapping)

**观察到的情况：**
Balance-Figures-Calculation-Logic.txt 自身的横幅明确说明，在 2026-08-20 那次 Tight Available Balance 公式变更之后，"本次修订中只对纯递增、单笔变动记录的表格（A1、A2-Increase、B1、B2-Increase）做了逐一重新核实——阅读其他每一张表格自身的‘Tight Available Balance’这一行时，应通过 §5 的一般规则来理解，而不要假设它已经被逐行重新审核过。"

**依据来源：**
Balance-Figures-Calculation-Logic.txt 第 59-64 行（横幅）

**存在的问题：**
这是源文档自身在验证覆盖范围上一处已披露的知识空白，而不是本次萃取中的臆造风险——但这意味着本次萃取的多条决策表行（例如 A3/A3S/A4/A6/A7/A8/A9/A10/B2-Decrease/B3/B4/B5/B6 各自的 Tight Available Balance 行）都是依据 §5 的一般模式推断得出，而不是依据针对某个具体函数单独重新核实过的数据。

**待确认的问题：**
除了明确点名的这四张表（A1、A2-Increase、B1、B2-Increase）之外，每一张按函数划分的表格自身的 Tight Available Balance 行，是否已经针对真实/测试数据被逐一重新核实过？

---

### GAP-065 (db-design-docs)

**观察到的情况：**
idx_contracts_naturalkey 被记录为一个普通的、非 UNIQUE 的索引；重复 ISSUE 时基于自然键唯一性的守卫（NaturalKeyAlreadyExistsError）完全是在应用层代码中、在 createMovement() 内部实现的。

**依据来源：**
Balance-Component-DB-Design.txt §8.4（第 795-802 行）

**存在的问题：**
数据库本身并不强制"一个自然键（instrument_type + lc_number/ib_number/sg_number/leg_seq）只能对应一份 ACTIVE 状态的合约"。如果应用层逻辑在任何情况下被绕过、存在缺陷，或某个非 HTTP 调用方直接调用了存储层，就有可能写入一个重复的 ACTIVE 自然键，而没有任何数据库层面的兜底——这一点与 idx_contracts_one_active 不同，后者在数据库层面保护了 logical_contract_id/ACTIVE 这条不变式。

**待确认的问题：**
业务方是否已经确认这条"自然键唯一性"规则没有任何例外，从而现在可以安全地把 idx_contracts_naturalkey 转换成一个真正的、带 WHERE status='ACTIVE' 条件的部分 UNIQUE 索引，与 idx_contracts_one_active 的模式保持一致？该文档将此列为一项待定的未来考量，但没有记录任何一方的决定。

---

### GAP-066 (db-design-docs)

**观察到的情况：**
第 13 号迁移为 superseded_movement_id 与 reversal_of_movement_id（两者都自引用 balance_movements.movement_id）添加了真正的外键约束，但文档中明确说明应用层目前并没有写入这两个列中的任何一个。

**依据来源：**
Balance-Component-DB-Design.txt §4.2.4 superseded_movement_id/reversal_of_movement_id 各行（第 349-353 行）

**存在的问题：**
如今这两个列拥有完整的 schema 支持（包括外键强制约束），却完全没有被任何当前的业务流程使用——尚不清楚这是为了某项已规划、但尚未构建的功能（例如未来的变动记录替代/反冲功能）预先铺设的脚手架，还是纯粹的死 schema。

**待确认的问题：**
是否存在一项具体的路线图，将开始写入 superseded_movement_id/reversal_of_movement_id？还是说目前应该把它们当作推测性的/未使用的列来看待？这套文档中没有任何一处给出答案。

---

### GAP-067 (db-design-docs)

**观察到的情况：**
该文档指出，balance_movements 的仅追加（append-only）模型，加上每行最多 7 个 JSON 快照列，意味着长期存储量会持续增长，并"建议评估"基于 created_at 的分区或归档策略，而不是让数据在单一表中无限累积。

**依据来源：**
Balance-Component-DB-Design.txt §8.3（第 787-793 行）

**存在的问题：**
这只是措辞为"建议评估"，而不是一项已定案的决策——没有给出具体的阈值、目标保留期限，或已确定的分区/归档设计。

**待确认的问题：**
在这两份文档之外，是否存在一套已定义的保留/分区策略？还是说这确实是一个尚未决定的开放事项，应该在这张表的数据量大到在运营层面产生影响之前加以跟踪？

---

### GAP-068 (db-design-docs)

**观察到的情况：**
"将 balance_movements 中重复出现的 xxx_by/xxx_at 列以及 7 个 JSON 快照列规范化为 movement_actions/movement_snapshots 表"这一 P1 建议，被明确延后到"无论 PostgreSQL 迁移何时发生"，没有给出目标日期或触发条件。

**依据来源：**
Balance-Component-DB-Optimization-Analysis.txt P1 章节（第 96-102 行），§4 第 4 项（第 226-227 行）

**存在的问题：**
规范化工作本身以及 PostgreSQL 迁移（行级锁定这一需求所必需的前提）在这两份文档中都是没有承诺时间表的开放性未来事项。

**待确认的问题：**
PostgreSQL 迁移（也将一并承载这项规范化工作）是否有一个目标日期、触发条件（例如超出原型/单进程阶段），或负责的团队？这两份文档均未说明。

---

### GAP-069 (quality-remediation-history)

**观察到的情况：**
针对 SHGT PARTIAL_REDEEM/FULL_REDEEM 唯一的服务端检查是 checkRedeemSufficiency（金额 ≤ Available Balance）——并没有检查一次 PARTIAL_REDEEM 是否真的携带了一个与某笔真实 IPLC_LC UTILIZE 共享的 businessEventId（即 A3S 那种以单据匹配为依据的模式）。

**依据来源：**
Balance-Component-Business-Rule-Decisions-2026-08-21.md 行动项 2；Balance-Component-Handoff-Note-2026-08-21.md 第 2 项

**存在的问题：**
Angular UI 的 A9 锁定只是一种 UX 层面的约定。任何绕过 Angular 客户端、直接调用 POST /balance-movements 的调用方，如今仍然可以对任意一份 SG 提交一笔任意、与单据无关的 PARTIAL_REDEEM——而这正是经 BA 确认的 Rule #1（"SG 解除担保以票据为依据，而非以金额为依据"）原本要杜绝的场景。依据 2026-08-21 的决定，这一点被明确延后处理，"决定先只做测试用例"。

**待确认的问题：**
businessEventId/UTILIZE 配对检查是否应该在被视为已关闭之前，被补充进 shgtRedeem.ts 或 balanceService.ts 的 SHGT REDEEM 路径？还是说这项延后本身如今已经是一项永久的、已披露的权衡取舍（与 A9 最初仅限 UI 层的设计立场一致）？

---

### GAP-070 (quality-remediation-history)

**观察到的情况：**
只有两个已知的 Business Case Registry 测试 fixture（export-case-2/4）被从 BUYERS_USANCE 修正为 SELLERS_USANCE。tenorRouting.ts/balanceService.ts 中没有任何守卫，能够拒绝或规范化一个直接对 EPLC_CONFIRMATION 或 EPLC_LC 合约声明 tenorType: 'BUYERS_USANCE' 的直接 API 调用方。

**依据来源：**
Balance-Component-Business-Rule-Decisions-2026-08-21.md 行动项 3；Balance-Component-Handoff-Note-2026-08-21.md 第 3 项

**存在的问题：**
一个非 UI 调用方（原始 API 调用、未来的第二套 UI，或某个集成）仍然可以创建一笔带 BUYERS_USANCE 的出口保兑，届时 B4 的 derivesMovementTypeFromTenor 逻辑会将其错误地路由到 ACCEPT（从而创建出本不应存在于保兑行账上的 Acceptance Liability/Reimbursement Receivable），而不是 HONOUR。

**待确认的问题：**
EPLC_CONFIRMATION/EPLC_LC（出口）是应该直接拒绝 BUYERS_USANCE，还是应该悄悄地将其规范化为 SIGHT？这份决策备忘录明确将这一实现选择留待讨论——前中台是否仍需要为 MT700/报表目的保留"Buyer's Usance"这个标签，即便它已经无法驱动出口余额的计算逻辑。

---

### GAP-071 (quality-remediation-history)

**观察到的情况：**
微服务中完全没有任何身份认证/鉴权（每一个 Maker/Checker 字段都是调用方自由填写的字符串）；生产环境的 Angular 依赖中存在 8 个高危 CVE（@angular/core 等停留在 17.3.x 版本）；SQLite 的全文件锁定机制无法演示真正的按工具粒度的并发。

**依据来源：**
Quality-report-balance.md BAL-001/BAL-002/BAL-102（已延后处理，经用户确认）；Sonar-Scan-Report.md/SonarQube-report2.md

**存在的问题：**
以上三项都被明确列为"在进入任何生产环境考虑之前的准入条件"，而不是已关闭的问题——这是在每一轮整改评审中都反复被重新确认的、有意为之的延后处理，而非疏忽。一个整套完整性模型都依赖"知道是谁做了这个操作"的四眼（4-eyes）控制机制，目前却完全没有办法验证究竟是谁执行了操作。

**待确认的问题：**
目前没有待解决的问题——这三项都是被有意接受、并已披露的原型阶段权衡取舍；在此标记出来，只是为了让下游知识库使用者不要把"质量门禁通过"/综合评分 100 分误读为生产就绪。

---

### GAP-072 (quality-remediation-history)

**观察到的情况：**
幂等冲突检测（balanceContractId、eventSeq 唯一约束）依赖对 node:sqlite 驱动自身错误文本的字符串匹配，因为 node:sqlite 没有可供替代匹配的稳定约束错误代码。

**依据来源：**
Quality-report-balance.md BAL-120

**存在的问题：**
驱动升级或错误文案措辞的变化，都可能在没有任何编译期或类型层面信号的情况下，悄悄破坏幂等冲突检测。

**待确认的问题：**
鉴于本沙箱环境中没有 PostgreSQL 实例可供开发出更稳健的机制，这一点已经过用户确认为可接受、延后处理——目前仍处于开放状态，仅待与 BAL-102 相同的那次 PostgreSQL 迁移一并解决。

---

### GAP-073 (quality-remediation-history)

**观察到的情况：**
createMovement() 的认知复杂度（Cognitive Complexity）在 BAL-141 重构之后一度降到 71，但本文档集中并未看到之后有任何专门的复审；builder-fields.ts（53）与 inquire-events.service.ts（50）仍是次严重的两个异常项，均在此前的扫描中被标记出来，自那次扫描写下之后再未被处理过。

**依据来源：**
SonarQube-report2.md"建议的后续步骤"第 2-4 项

**存在的问题：**
这不是一个质量门禁的拦截项（代码异味在本项目已配置的门禁中并不被拦截），但作为一项可维护性技术债，明确被指出值得单独关注，与 BAL-141 当初落地时的成效无关。

**待确认的问题：**
是否计划对 createMovement()/builder-fields.ts/inquire-events.service.ts 进行进一步的拆分？还是说，考虑到该文件本身的审计关键性（每一笔变动记录的合法性都在这里被判定），当前基于注册表分派的形态已经被视为一种可接受的稳定状态？

---

### GAP-074 (quality-remediation-history)

**观察到的情况：**
映射工作簿（analysis/TF_Balance_Component_Mapping-{en,zh}.xlsx）自身的 Rule #1 README 文字，尚未更新为明确说明"Matched Amount（匹配金额）≠ Redeemed Amount（赎回金额）"这一区别，也未点名 A3S 这一例外情形。

**依据来源：**
Balance-Component-Business-Rule-Decisions-2026-08-21.md 行动项 5

**存在的问题：**
按照项目治理规定，该工作簿名义上仍然是构建层面权威的来源，但其自身的文字尚未反映出实际已实现的、经 BA 确认的这一细微差别——未来一个只读该工作簿、而没有读过这份决策备忘录的读者，可能会重新推导出一条错误的、比实际实现更严格的规则。

**待确认的问题：**
等待 BA 自行更新该工作簿——这不是一项程序员的行动项，但值得作为一项开放的文档同步知识空白加以跟踪，直到被关闭为止。

---

### GAP-075 (ledger-html)

**观察到的情况：**
账本文档将 A9 描述为可以像 A3S 自身的 SG 腿一样接受一次 MIN(单据金额, SG 未结清余额) 推导出的部分赎回，称这是自 2026-08-15 一次针对源设计文档"全有或全无"解除担保模型的业务方覆盖决定以来，已确认交付的行为。

**依据来源：**
analysis/contingent-liability-ledger.html Folio 2 release 行 + Notes 第 8 项，对照 CLAUDE.md 决策日志条目"A9（SG Redemption）锁定为仅 Full Redeem"

**存在的问题：**
CLAUDE.md 自身较晚（日期为 2026-08-21）的一条决策日志条目说明，A9 后来在 Angular UI 层被锁定为仅支持 Full Redeem，金额受保护/来源于该 SG 的 Available Balance——明确是因为依据 TF_Balance_Component_Mapping Rule #1，SG 解除担保应以票据为依据。这份账本文档并未随之更新，如今对 A9 的描述已经不再与已交付的 Angular UI 行为相符（不过对于其他 API 调用方而言，也许仍然与未变的微服务/领域层行为相符）。

**待确认的问题：**
contingent-liability-ledger.html 的 Folio 2 / Note 8 是否应该被修订，明确说明这一仅限 A9 的 Full-Redeem UI 层锁定（与 Balance-Figures-Calculation-Logic.md 针对同一变更所做的更新方式一致）？还是说该文档有意只描述领域/微服务层面的行为，把 UI 层的限制排除在这份参考文档的范围之外？

---

### GAP-076 (ledger-html)

**观察到的情况：**
该文档标记了一项已知的分歧：Balance Component 的 A6 会为 Buyer's Usance 进口信用证创建一条 Acceptance/DPU 影子记账（shadow-memo）记录，而源设计文档则将真正的 Buyer's Usance 承兑直接路由到 LC_HONOUR_BU_A/BU_B，完全不产生任何 Acceptance 工具（只有 Seller's Usance 才应该到达 LC_ACCEPT）。

**依据来源：**
analysis/contingent-liability-ledger.html Folio 3 Buyer's Usance 行 + Notes 第 9 项

**存在的问题：**
这份文档和 CLAUDE.md 的决策日志中都没有说明，这处分歧究竟是经业务方批准的、有意为之的范围简化，还是等待修复的未解决缺陷（例如未来某个 fundingParty 字段，或按 BU/SU 拆分的会计处理）。

**待确认的问题：**
Balance Component 在 A6 上对 BU/SU 采取统一的 Acceptance 处理方式，是一项被接受的永久性简化，还是一项应被跟踪的知识空白——最终应按源设计文档区分 Buyer's Usance（不产生 Acceptance 工具）与 Seller's Usance（产生一个）？

---

### GAP-077 (ledger-html)

**观察到的情况：**
B4 的 movementTypeFromContractTenor 把出口的期限处理简化为仅 Sight 与 Usance 两种情形，从未区分源设计文档自身 §7.5 中的"Case 1"（Buyer's Usance 见票即付，不产生 Acceptance）与"Case 2"（Buyer's Usance 以承兑方式付款，产生 Acceptance）——每一笔非 Sight 的保兑，始终被当作会产生 Acceptance 的路径来处理。

**依据来源：**
analysis/contingent-liability-ledger.html Folio 4 folio-note + Notes 第 10 项

**存在的问题：**
与进口侧的 BU 分歧一样，这份文档或 CLAUDE.md 中都没有记录任何业务决定，来确认"为每一笔 Usance 保兑都统一创建一条 Folio-5 Acceptance 影子记录（而不区分 Case 1/Case 2）"是否有意为之。

**待确认的问题：**
B4 未来是否应该区分源设计文档中的 Case 1（Buyer's Usance 见票即付，不产生 Acceptance）与 Case 2（以承兑方式付款）？还是说当前"仅按 Sight/Usance 二分"的简化处理是一项被接受的永久性做法？

---

### GAP-078 (ledger-html)

**观察到的情况：**
源设计文档中要求的四类反冲（Dr/Cr reversal）事件——信用证到期/取消、保兑到期、SG 减额修改，以及 SG 项下索赔——在 Balance Component 中都完全没有实现：没有任何一个对应的 movementType，按照本文档自身的说法，SG 减额/索赔"连一个实际可行的 A8/A9 变通方案都没有"。

**依据来源：**
analysis/contingent-liability-ledger.html Folio 1/Folio 4 残留行、Folio 2 各行，Notes 第 4 项和第 7 项

**存在的问题：**
这些都被记录为源设计文档中真实存在的需求，而非纯理论性的，但目前完全未实现，且本文档或 CLAUDE.md 中都没有记录任何路线图状态。

**待确认的问题：**
信用证/保兑的到期-取消，以及 SG 减额修改/索赔，是计划在未来某次实现中投入，还是被永久排除在 Balance Component 参考客户端的目标之外？

---

### GAP-079 (ledger-html)

**观察到的情况：**
源设计文档要求 Amendment Decrease（减额修改，A2/B2）在产生任何余额变动之前，必须先以记录在案的受益人同意（依据 UCP 600 第 10(a)/(c) 条）作为门槛。Balance Component 则是在 Maker 提交后立即记账 AMEND_DECREASE/负值 AMEND 变动记录，整个流程中没有任何同意采集步骤或门槛。

**依据来源：**
analysis/contingent-liability-ledger.html Notes 第 1 项

**存在的问题：**
这是一个与合规相关的控制点缺口，由文档自身明确指出，但其严重程度/处置方式（对参考实现而言可接受的简化，还是真正的生产环境阻断项）在本文档或 CLAUDE.md 决策日志中均未说明。

**待确认的问题：**
在正式上线生产环境之前，是否应该增加一个受益人同意采集/门槛环节？还是说，它的缺失是这个参考客户端范围内一项已接受、已记录在案的限制？

---

## 验证阶段标记的知识空白（12 项）

### GAP-001 (MOVEMENT-RULE)

**观察到的情况：**
BalanceContractStore.listVersions()/markSuperseded() 以及 balance_contracts.contract_version/supersedes_balance_contract_id 这两个列，都存在并被记录为 Amendment（修改）版本链机制，但 balanceService.ts（唯一的消费方）从未调用过这两个方法中的任何一个——它把 contractVersion 硬编码为 1，并把所有修改都当作针对同一份、不曾变化的合约的普通 BalanceMovement 记录来处理。

**依据来源：**
microservices/balance-component/src/store/balanceContractStore.ts + service/balanceService.ts

**存在的问题：**
这要么是 (a) 真正的死代码，应该被移除，以免误导未来阅读数据库设计文档的读者；要么是 (b) 一项部分实现的功能——版本链机制已经构建完成，但从未真正完成接线，使其在 AMEND_INCREASE/AMEND_DECREASE/AMEND 时被实际调用。

**待确认的问题：**
balance_contracts 的版本链机制（contract_version/supersedes_balance_contract_id/listVersions/markSuperseded）当初是否真的打算被接入实际的 AMEND 流程？还是说当前这种"仅基于变动记录"的修改模型是一项取代了原始数据库设计文档的、有意为之的后续决定？如果是有意为之，数据库设计文档及其未被使用的存储方法就应该被标记/移除；如果是无意为之，这就是一处真实的实现缺口。

---

### GAP-002 (MOVEMENT-RULE)

**观察到的情况：**
ledger.html 的 Folio 2 表格和 Implementation Notes 仍然把 A9 描述为具备 MIN() 推导的 PARTIAL_REDEEM 能力，与 A3S 一致；而 CLAUDE.md 较晚的决策日志则说明 A9 仅在 Angular UI 层被锁定为 Full Redeem，后端对其他调用方仍保持开放。

**依据来源：**
analysis/contingent-liability-ledger.html，对照 CLAUDE.md 2026-08-21 的 A9 Full-Redeem 锁定决策日志

**存在的问题：**
ledger.html 被标注/描述为反映了较早的设计状态，并未在 2026-08-21 那次 A9 锁定决定之后被更新，因此仅参考 ledger.html 的读者，对 A9 自身 UI 层行为得到的会是一幅过时的图景（不过对于一个原始 API 调用方而言，它可能仍然是准确的）。

**待确认的问题：**
是否应该更新 analysis/contingent-liability-ledger.html 的 Folio 2/A9 行以及 Implementation Notes，以说明 2026-08-21 那次 UI 层锁定（就像 Balance-Figures-Calculation-Logic.md 针对同一变更所做的更新那样）？还是说这份文档有意只作为一份不追踪 UI 层限制的后端 API 层级参考文档？

---

### GAP-003 (STATUS-RULE)

**观察到的情况：**
Balance-Component-DB-Design.txt 明确描述了 LC 修改是通过一份新的 balance_contracts 记录加上 markSuperseded() 版本链机制来实现的，但 balanceService.ts 在其唯一真正的 createContract() 调用点上硬编码了 contractVersion:1，且 markSuperseded() 除了一个底层数据库单元测试之外没有任何调用方。

**依据来源：**
microservices/balance-component/src/service/balanceService.ts（约第 1419-1420 行）；microservices/balance-component/src/store/balanceContractStore.ts:271-290；analysis/Balance-Component-DB-Design.txt

**存在的问题：**
要么是数据库设计文档在描述一种从未真正接入服务层的、愿景性的未来机制；要么是这套版本链 schema（idx_contracts_one_active、idx_contracts_logical_version、supersedes_balance_contract_id/superseded_by_balance_contract_id）如果修改被永久性地打算保持为"基于变动记录"，就应该被记录为死重量（并考虑移除）。

**待确认的问题：**
版本链合约模型（markSuperseded、contractVersion>1）是否为未来某项功能而规划（例如完整的信用证重新签发/以新工具方式修改）？还是说，数据库设计文档及其自身的 schema 注释应该被修正为描述实际的、基于变动记录的修改机制，并把版本链相关的列/索引标记为当前未使用？

---

### GAP-004 (STATUS-RULE)

**观察到的情况：**
TF_Contingent_Liability_Lifecycle-en.txt §3.2 要求在任何信用证/保兑的减额或取消变动记录之前，都必须先有 UCP 600 第 10(a)/(c) 条的受益人同意门槛，并将其建模为一种类似 PENDING_BENE_CONSENT 的中间状态——但在 ContractStatus/MovementStatus 或 AMEND_DECREASE/AMEND(减额) 的充足性检查中，都不存在这样的状态、字段或门槛。

**依据来源：**
microservices/balance-component/src/types.ts:39,48；microservices/balance-component/src/service/balanceService.ts（checkAmendDecreaseSufficiency 的调用点）；已转换文档 TF_Contingent_Liability_Lifecycle-en.txt §3.2

**存在的问题：**
目前，一个 Checker 可以在完全没有任何受益人同意被记录在案的情况下，直接 Release 一笔信用证/保兑的减额——如果这套系统本应忠实地建模真实的或有负债会计流程，依据这份文档自身对控制点的表述，这是一处真实的 UCP 600 合规缺口。

**待确认的问题：**
针对减额/取消的受益人同意门槛，是一项有意延后处理的范围事项（就像已披露的 BAL-001/BAL-002 免鉴权延后处理一样），还是一处未被注意到的合规缺口，应该提交给业务/BA 负责人做出真正的决定（实现、正式延后，还是从设计文档中移除范围）？

---

### GAP-005 (STATUS-RULE)

**观察到的情况：**
TF_Contingent_Liability_Lifecycle-en.txt §3.4/§7.3 与 TF_Balance_Component_Spec-en.txt §5.1/§12 都描述了一个无人值守、系统自动生成的第 16(f) 条禁反言（preclusion）事件——在没有有效拒付通知的情况下，于交单日期 + 5 个银行工作日自动触发，把风险敞口重新加权为 100%，并永久阻止之后再提出的拒付。微服务中并不存在任何定时器、计划任务、cron，或等效于 LC_DOC_PRECLUDED 的状态。

**依据来源：**
microservices/balance-component/（整个源码/测试目录树，grep 结果为负）；已转换文档 TF_Contingent_Liability_Lifecycle-en.txt、TF_Balance_Component_Spec-en.txt

**存在的问题：**
在当前系统中，一份存在不符点、尚未被拒付的交单，可以无限期地悬而不决，既不会有任何自动的风险敞口重新加权，也没有任何机制来防止一次逾期的拒付在这 5 个银行工作日的窗口过后仍被错误地接受——如果这套系统本应忠实地强制执行第 16(f) 条禁反言规则，这是一处真实的风险建模缺口。

**待确认的问题：**
第 16(f) 条自动禁反言机制是否完全不在 Balance Component 的范围之内（例如由上游的贸易融资发起系统负责，由它来通知本组件禁反言事件发生，而不是由本组件自己计算定时器）？还是说这是一项确实已规划但尚未构建的能力，应该作为待办事项加以跟踪？

---

### GAP-006 (STATUS-RULE)

**观察到的情况：**
A10/B6 的 CLOSE（Maker/Checker 触发的核销动作，2026-08-21 新增）覆盖的是信用证/保兑的自愿终止，但 contingent-liability-ledger.html 自身的 Folio 1/Folio 4 各行同时描述了"到期"（由日期触发）和"取消"这两种情形都需要相同的残留反冲处理——CLOSE 并没有一个独立的原因代码，来区分 Maker 主动发起的自愿关闭与自动的、基于日期的到期。

**依据来源：**
analysis/contingent-liability-ledger.html Folio 1/Folio 4 残留行；microservices/balance-component/src/db/schema.ts:58-74（MOVEMENT_TYPE_VALUES，只有单一的 CLOSE 值，没有 EXPIRE）

**存在的问题：**
如果审计人员或下游报表需要区分"我们主动核销了这一笔"与"这笔信用证在到期日/成熟日未被使用便自然失效"，当前单一的 CLOSE movementType 无法表达这种区别，而且目前也仍然没有任何自动的、基于日期的流程去捕获一笔单纯到期、无人提交 CLOSE 的信用证。

**待确认的问题：**
业务方是否需要一套独立的、自动的到期机制（基于日期触发，无需 Maker 操作），作为对现有 Maker/Checker 触发的 CLOSE 的补充？还是说，CLOSE 有意打算成为未来唯一的核销路径（到期在运营层面处理，例如由运营团队在某项贸易融资额度到期后手工提交 CLOSE）？

**2026-08-26 更新（已解决）：** 是，F1 已交付独立的、自动的、基于日期的 AUTO EXPIRY 机制（新 movementType `EXPIRE`，`domain/expiryEligibility.ts`，由背景 `setInterval` 批次以 `BATCH_MAKER`/`BATCH_CHECKER` 系统身份逐筆触发，四眼原则不被繞過），与既有 Maker/Checker 触发的 CLOSE 并存、彼此独立——CLOSE 仍是自愿终止路径，EXPIRE 是到期自动路径，两者有各自独立的 movementType，可在稽核/报表中区分。详见 [[STATUS-RULE-031]]、[[MOVEMENT-RULE-063]]、[[09-Architecture/auto-expiry-auto-close-background-sweep-and-grace-period]]。


### GAP-007 (F1-REOPEN)

**观察到的情况：**
`reopenRestoration.ts` 的复原金额计算被设计为向后走完整条尚未反转的 RELEASED EXPIRE/CLOSE 链（而非只处理最后一笔），用以支持"Reopen → 再次 Close/Expire → 再次 Reopen"的重复场景。

**依据来源：**
`microservices/balance-component/src/domain/reopenRestoration.ts`；`test/unit/service/expiryExtensionAndReopen.test.ts`（REOPEN 相关测试群组）

**存在的问题：**
按代码结构推断，第二次 Reopen 应该能正确地在遇到中间那次 REOPEN 时停止向后走、不重复计入更早的链——但没有找到专门针对这个"二次重启链"情境的自动化测试直接验证这一行为。

**待确认的问题：**
是否需要补一个专门的"Reopen → Close → Reopen 再次"链式测试，直接断言复原金额没有重复计入？

---

### GAP-008 (F1-REOPEN)

**观察到的情况：**
`expiryExtensionAndReopen.test.ts` 的 REOPEN 测试群组目前看起来只使用 `IPLC_LC`（经由 `issueImportLc()`）夹具；未找到专门针对 `EPLC_CONFIRMATION`（B7）执行 REOPEN 的测试。

**依据来源：**
`microservices/balance-component/test/unit/service/expiryExtensionAndReopen.test.ts`

**存在的问题：**
逐行代码检查显示 REOPEN 的核心逻辑（`reopenRestoration.ts`、`service/balanceService.ts` 的 REOPEN 分支）并未对 instrumentType 做任何特殊分支，理论上应该对 B7 同样适用——但这是代码结构推断，不是直接的测试证据。

**待确认的问题：**
是否需要补一个 B7（Export 侧）专属的 REOPEN 测试，把这个测试覆盖缺口坐实/排除？

---

### GAP-009 (F1-REOPEN)

**观察到的情况：**
`TOLERANCE_APPLICABLE_MOVEMENT_TYPES`（或等价的容差适用性表）中未见 `REOPEN` 出现。

**依据来源：**
`microservices/balance-component/src/domain/tolerance.ts`

**存在的问题：**
无法判断这是刻意排除（REOPEN 复原的是历史已发生金额，不需要重新套用容差）还是单纯未被考虑到的疏漏——两种解释目前都说得通，没有直接证据可以二选一。

**待确认的问题：**
REOPEN 复原金额是否应该套用 Tolerance 换算？如果本来就不需要，是否值得在 `tolerance.ts` 自身的文档注释里明确写下"REOPEN 刻意排除"，避免未来被误判为疏漏？

---

### GAP-010 (F1-REOPEN)

**观察到的情况：**
未逐行核实 `gatherEventTree()`（或等价的事件树收集逻辑）在处理 Export 侧 `EPLC_EXAMINATION`（对应 B3 Present Docs 的 memo 占位事件）时，对 REOPEN 自身资格检查的处理方式，是否与它对 B6 CLOSE 资格检查采用的"RELEASED 但尚未被消费的 B3 视为未结事件"规则完全一致。

**依据来源：**
`microservices/balance-component/src/service/balanceService.ts`（`evaluateContractCloseEligibility`/REOPEN 相关分支，共用同一底层函数，未逐行比对两条路径）

**存在的问题：**
如果两条路径的判定不一致，可能导致 B7 REOPEN 在某些 Present Docs 尚未完全走完的情境下，资格判定结果与 B6 CLOSE 不对称。

**待确认的问题：**
是否需要针对这个共用函数在 REOPEN 与 CLOSE 两条路径上的行为一致性，补一组直接对照的测试？

---

### GAP-011 (F1-mandatory-fields)

**观察到的情况：**
`assertExpiryDateRequired()`（Maker 端，MOVEMENT-RULE-075）在 `release()`（Checker 端）的镜像重新检查，只在 `contract.expiryDate` 已经是真值时才重新校验其"是否为本国营业日"——但不会重新校验它"是否存在"本身；而同一批新增的另外 4 条必填栏位规则（naturalKey/sourceTransactionRef/tenorType/tenorDays）在 `release()` 端都是无条件重新校验"是否存在"。

**依据来源：**
`microservices/balance-component/src/service/balanceService.ts`（`assertExpiryDateRequired()`/`assertExpiryDateIsBusinessDay()` 在 `release()` 中的调用条件，对照 `assertNaturalKeyFieldsRequired()` 等其余 4 条规则在 `release()` 中的调用条件）

**存在的问题：**
若某笔合约的 `expiryDate` 是透过繞過 Maker 端校验的方式（例如直接写入 DB）变成 null/空字符串到达 PENDING 状态，`release()` 目前不会拦截这个"必填栏位实际缺失"的情况——只有当它已经有值时才会检查这个值是否为营业日。这与既有 `assertValidAmount()` 等纵深防御的一致性做法不完全对称，虽然可以用"expiryDate 建立后不可变、且没有 DB 层约束会走到这条路径"来解释，但目前没有直接证据证明这个解释成立。

**待确认的问题：**
是否需要让 `release()` 也像其余 4 条规则一样，无条件重新校验 A1/B1 的 `expiryDate` 确实存在（而不只是它存在时是否为营业日）？

---

### GAP-012 (Phase2-Standing-handoff)

**观察到的情况：**
2026-08-26，BA 最终决定将「统一 isBusinessDay() 判断 / Special Working Day Override / Calendar Service 化」这整个 Phase 2 题目登记移交 Standing 微服务团队，`balance-component` 本身不修改、不新建共用 Calendar Service（详见 `analysis/standing-microservice-reference/Phase2-CalendarService-Options-for-BA-Decision-zh.md` 的「BA 最終決定」章节）。

**依据来源：**
`analysis/standing-microservice-reference/Phase2-CalendarService-Options-for-BA-Decision-zh.md`；`analysis/standing-microservice-reference/Auto-Close-Grace-Period-Business-Day-Requirement.md`

**存在的问题：**
本知识库目前仍然如实记录 `domain/autoCloseGracePeriod.ts`（Phase 1，仅排除週末）、`domain/domesticCalendar.ts`（假日優先後改為週末優先）、`microservices/business-days-mock/server.js`（週末優先）三份「各自獨立、彼此不完全一致」的營業日邏輯——这不是本知识库的錯誤，而是如实反映了 2026-08-26 決定之前就已存在、且該決定明確表示「暫時維持現狀」的真實程式碼現況；但這代表這三份邏輯彼此不一致的狀態，在 Standing 服務真正接手並統一之前，會持續是「已知但可接受」的狀態，不會由 `balance-component` 自己收斂。

**待确认的问题：**
不适用——這不是需要業務方回答的問題，而是提醒未來的讀者：這個「三份邏輯不一致」的觀察，其解法已經有明確的責任歸屬（Standing 團隊），不需要 `balance-component` 工程隊再次評估是否要自己統一。

