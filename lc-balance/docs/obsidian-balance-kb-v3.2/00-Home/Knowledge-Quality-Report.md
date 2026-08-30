---
knowledge_id: Knowledge-Quality-Report
title: "知识质量报告"
domain: Balance
category: Quality Review
snapshot_date: 2026-08-30
tags:
  - balance
  - quality-review
---

# 知识质量报告

> [!note] 2026-08-30 增量同步
> 现行源码、OAS 与受影响知识节点已完成新一轮同步，详见 [[Freshness-Update-Log-2026-08-30]]。下方 v3.2 九维评分仍是历史评审结果，未在本轮虚构新分数；旧 OAS 版本、非原子 compound 与旧功能范围应以更新日志及其链接页为准。

本报告依据 v3.2 规范的九维评分标准，对 Balance Component Obsidian 知识库（vault-v2）做一次不打折扣的自我审查——所有数字均为本次现场重新统计所得，不沿用任何历史报告中的旧数字。库内共 **703 篇笔记**：206 条业务规则（194 条 CONFIRMED、3 条 INFERRED、9 条 CONFLICT），另有 79 项未获准建立独立规则文件的知识空白（73 项萃取阶段标记 + 6 项对抗式验证阶段标记，收录于 [[Knowledge-Gaps]]）；98 张决策表；220 个测试场景，覆盖 20 个来源领域；[[Source-to-Knowledge-Map]] 中引用了 100 余个不同的源文件。

**2026-08-26 增量同步后现状（未重新执行完整九维评分，见下方专节说明）：** 库内现共 **735 篇笔记**（+32）：233 条业务规则（220 条 CONFIRMED、3 条 INFERRED、9 条 CONFLICT、1 条 SUPERSEDED），另有 85 项知识空白（73 项萃取阶段 + 12 项对抗式验证/增量同步阶段标记）；决策表、测试场景数未变（本次同步未涉及）；[[Source-to-Knowledge-Map]] 引用的不同源文件数升至 94 个。具名业务功能从 16 个（A1–A10/B1–B6）增至 **18 个**（新增 A11、B7）。

v3.2 规范要求九个维度全部达到 **≥ 9.3**，其中「代码可追溯性」与「幻觉控制」需达到 **≥ 9.5**。本次审查按此标准如实评分：**九个维度中有 6 个达标，3 个未达标**——未达标的三项（容差规则覆盖、测试可追溯性、可维护性）均在下文给出具体成因与整改计划，未做任何为凑数而虚报的调整。（本报告首次生成时 Obsidian 链接质量为 9.0/未达标，发现 47 篇孤儿笔记；随后已将这 47 篇全部补入对应文件夹索引笔记，复查确认孤儿数归零，故此维度已上调为达标，详见下文该节末尾的复查记录。）

| 维度 | 目标 | 得分 | 是否达标 |
| --- | ---: | ---: | :---: |
| 业务知识覆盖度（Business Knowledge Coverage） | ≥ 9.3 | **9.4** | ✅ |
| 代码可追溯性（Code Traceability） | ≥ 9.5 | **9.5** | ✅ |
| 余额/风险敞口覆盖度（Balance/Exposure Coverage） | ≥ 9.3 | **9.5** | ✅ |
| 容差规则覆盖度（Tolerance Rule Coverage） | ≥ 9.3 | **9.2** | ⚠️ 未达标 |
| API 覆盖度（API Coverage） | ≥ 9.3 | **9.3** | ✅ |
| 测试可追溯性（Test Traceability） | ≥ 9.3 | **9.0** | ⚠️ 未达标 |
| Obsidian 链接质量（Obsidian Linking Quality） | ≥ 9.3 | **9.4** | ✅ |
| 幻觉控制（Hallucination Control） | ≥ 9.5 | **9.6** | ✅ |
| 可维护性（Maintainability） | ≥ 9.3 | **8.6** | ⚠️ 未达标 |

## 业务知识覆盖度 — 9.4

内容广度覆盖了微服务 `domain/`（余额推导、状态转换、容差、表外风险敞口、结案资格、tenor 路由）、`service/balanceService.ts` 的 Maker/Checker 编排、DB/store/validation 层、两支 Express 路由文件、Angular `transaction-builder/` 全部界面（Maker/Checker 面板、Inquire Events、pickers、编排壳层）、`backend/` Business Case 登记表与 Business Case Runner UI、两份 OpenAPI 规格，以及全部 `analysis/` 设计文档。206 条规则、98 张决策表、220 个测试场景共同构成了对这一广度的可验证支撑。未扣分至更高档,是因为内容语言一致性问题（见「可维护性」）虽不减损知识本身的完整度，但确实削弱了「覆盖度」对读者的实际可用性——此处按内容广度本身评分，语言问题不重复计入。

## 代码可追溯性 — 9.5

对 206 条规则逐一核对：**100%**（207/207，含一篇归类不当但同样具备该结构的笔记）都带有「来源证据」小节，区分实现与测试证据，并非事后补写；[[Balance-Traceability-Matrix]] 与 [[Source-to-Knowledge-Map]] 分别提供规则→实现和源文件→规则两个方向的映射。203/206（98.5%）规则另附有独立的「验证说明」小节,记录对抗式验证阶段的复核过程。扣分项与此前一致：本仓库快照没有 `.git` 历史，"已核实提交"只能退而求其次以快照日期 + 文件 mtime 作为代理指标,这一点在相关笔记中均如实披露,未被隐藏。

## 余额/风险敞口覆盖度 — 9.5

BALANCE-RULE（14 条）与 EXPOSURE-RULE（29 条）合计 43 条规则,覆盖余额推导、表外风险敞口、或有科目分录、结案资格四大子领域,并锚定在 [[Balance Derivation Rules]]、[[Off-Balance-Sheet Exposure]]、[[Exposure Model]] 等领域概念笔记上。**已用 Bash 逐一核实**：`03-Balance-Flows/A-Import/` 与 `B-Export/` 下,10 个进口具名功能（A1、A2、A3、A3S、A4、A6、A7、A8、A9、A10）与 6 个出口具名功能（B1–B6）——合计 16 个——每一个子文件夹都存在与文件夹同名的主笔记（例如 `A3S-Document-Arrival-SG/A3S-Document-Arrival-SG.md`）,部分子文件夹另有 1-3 篇细分笔记补充边界案例,没有任何一个具名功能缺失主笔记。

## 容差规则覆盖度 — 9.2 ⚠️ 未达标

14 条 TOLERANCE-RULE 加上 `05-Tolerance-FX/` 下 10 篇概念笔记（[[Tolerance Processing]] 等）,完整覆盖了容差上限换算公式、其适用性门槛,以及需要避开的 SHGT/LC ISSUE movementType 冲突;14 条规则中 11 条（79%）带有直接测试证据,高于全库平均水平。**未达 9.3 目标的原因**：这不是知识库自身的疏漏,而是被记录对象本身的边界所致——[[Balance Component Overview]] 的「範疇之外」小节明确写明,跨币别外汇换算不属于 Balance Component 职责范围（那是姊妹组件 Payment Component 的工作）,因此本组件自身可萃取的容差/FX 规则数量有限,继续在数量上"充实"该维度只会引入本仓库证据无法支撑的内容。**整改计划**：待 Payment Component 的知识库建成后,通过跨仓库链接（而非在本库内臆造 FX 深度)把两侧衔接起来;在此之前该分数如实保持在目标线以下,而非用无依据的内容拉高分数。

## API 覆盖度 — 9.3

两份 OpenAPI 文档（microservice v1.15.0、Channel API 门面规格）、两支 Express 路由文件及其端到端测试,共提炼为 54 篇 API 概念笔记,并由 [[API Index]] 统一索引。**已核实** `07-API/Function-API Integration Map.md` 存在,且其「对照表」一节完整覆盖全部 16 个具名业务功能（A1–A10、B1–B6),逐行给出各功能的 API 端点/instrumentType-movementType 组合、调用链,以及在 Import LC / Export Confirmed LC 全生命周期中的位置,并回链各功能自身笔记。内容广度达标,但本节 56 篇笔记中有 55 篇（98%）仍以英文小节标题呈现（`## Source Evidence`/`## Related Knowledge` 而非中文对应标题),是全库语言一致性问题最集中的区域之一——按内容完整度评为 9.3,该语言问题已在「可维护性」中作为主要扣分依据统一说明,此处不重复扣分。

## 测试可追溯性 — 9.0 ⚠️ 未达标

以 [[Balance-Traceability-Matrix]] 自身按规则类别标注的统计为准（而非粗略关键字匹配)：206 条规则中 **132 条（64%）** 带有直接的单元/集成测试文件引用,其余 74 条的证据来自设计文档、API 规格或质量整改历史文档,这些来源本身不存在可引用的专属测试文件——矩阵中以 `—` 明确标注,从未被掩盖。分类别看：BALANCE-RULE 5/14、EXPOSURE-RULE 16/29、MAKER-CHECKER-RULE 38/57、MOVEMENT-RULE 39/62、STATUS-RULE 23/30、TOLERANCE-RULE 11/14。**未达 9.3 目标的原因**：64% 这一比例是对代码库自身构成的如实反映,但按 v3.2 更严格的 9.3 门槛衡量,仍不足以评为达标。**整改计划**：优先为 74 条仅有设计文档/API 规格证据的规则中、逻辑上可测试的部分补充专属单元测试并回填引用;对确属"设计意图、无法在当前代码结构下独立测试"的规则,在规则笔记中显式加注区分"无需测试"与"存在测试缺口待补",而不是笼统地留一个 `—`。

## Obsidian 链接质量 — 9.4 ✅

用脚本对全部 703 篇笔记做了程序化扫描（识别 `[[target]]`、`[[target|alias]]`、含转义竖线的表格内嵌链接、`#锚点` 写法)：**4112 处 wiki 链接引用中,0 处指向不存在的笔记**——链接完整性本身优秀。本报告首次生成时,同一脚本发现 **47 篇笔记从未被任何其他笔记链接过（孤儿笔记)**,集中于 `09-Architecture/`（53 篇中的 27 篇),另有 `01-Domain-Concepts`（6 篇)、`06-Maker-Checker`（5 篇)、`07-API`（5 篇)、`08-Data-Model`（2 篇)、`04-Exposure-Accounting`（1 篇)、`05-Tolerance-FX`（1 篇)零星分布,当时按未达标计分（9.0）。**复查与修复记录**：已将这 47 篇笔记逐一读取内容后,以 `[[filename|中文简短说明]]` 的形式补入对应文件夹的概念索引笔记（[[Domain Concepts Index]]、[[Exposure & Accounting Concepts Index]]、[[Tolerance & FX Concepts Index]]、[[Maker-Checker Concepts Index]]、[[API Index]]、[[Data Model Concepts Index]]、[[Architecture Concepts Index]]，其中 `09-Architecture` 一档新增了 5 个主题小节分类收纳),并重新运行同一脚本复查：**孤儿笔记数已降为 0,4112+ 处链接、0 处断链**。未评为满分（9.5+）的原因是：这套孤儿检测目前仍是一次性脚本核查,并未固化为知识库生成流程的强制关卡,不能保证未来批量生成笔记时不再出现同类回归（历史报告与本报告首次生成时的落差已证明过一次）;此外部分索引笔记为容纳新增条目临时新增了小节结构,尚未有第二轮人工复核其分类是否最优。

## 幻觉控制 — 9.6

每条规则均标注 CONFIRMED/INFERRED/CONFLICT 三态之一;证据不足的候选内容一律路由至 [[Knowledge-Gaps]],不建立独立规则文件——79 项知识空白（73 项萃取阶段 + 6 项对抗式验证阶段标记)全部有据可查、有明确的"观察到的情况/依据来源/存在的问题/待确认的问题"四段式结构。203/206（98.5%）规则带有独立的「验证说明」小节,记录对抗式验证过程主动寻找降级/合并/标记冲突理由的复核结果（最终 9 条 CONFLICT、3 条 INFERRED 存活,206 条候选中有相当比例被降级或合并,并非简单照单全收)。

## 可维护性 — 8.6 ⚠️ 未达标

全库统一 YAML frontmatter;[[Source-to-Knowledge-Map]] 给出源文件→知识的过期状态映射;笔记生成为脚本驱动而非手工逐篇撰写,理论上可对更新后的源码重新运行。**未达 9.3 目标的核心原因是语言一致性问题**——用 Bash 对九个代表性文件夹（01、02、04、05、06、07、08、09、11,合计 634 篇笔记)按小节标题语言做了逐篇统计,发现 **298 篇（约 47%）笔记的小节标题仍是英文**（如 `## Source Evidence`/`## Related Knowledge`/`## Conditions`/`## Result`),而非与库内多数笔记一致的中文标题（`## 来源证据`/`## 相关知识`等)。分布极不均衡：`06-Maker-Checker` 55/57（96%)、`07-API` 55/56（98%)、`11-Decision-Tables` 66/99（67%)、`04-Exposure-Accounting` 26/52（50%)、`09-Architecture` 26/53（49%)、`01-Domain-Concepts` 16/43（37%)、`02-Business-Rules` 54/208（26%),而 `05-Tolerance-FX` 与 `08-Data-Model` 两个文件夹已 100% 完成中文化。这意味着知识库目前处于中英文混杂的过渡状态,对不熟悉两套模板的后续维护者构成真实的认知负担。另发现一处轻微的归档问题：`02-Business-Rules/checkredeemsufficiency.md` 实为一篇 Domain Concept 笔记（frontmatter 中 `category: Domain Concept`),被误放入规则文件夹,且未被 [[Business-Rule-Index]] 或 [[Balance-Traceability-Matrix]] 收录,应视为索引生成脚本遗漏的个案。**整改计划**：(1) 用当初生成中文模板笔记的同一套脚本化流程,批量将剩余约 298 篇英文模板笔记转换为统一中文标题结构,优先处理 `06-Maker-Checker`、`07-API` 这两个几乎全英文的文件夹;(2) 将 `checkredeemsufficiency.md` 迁出规则文件夹或重新分类,并重跑索引生成脚本使其被正确收录;(3) 之后重新核对孤儿笔记与链接完整性,确认批量修改未引入新的断链。

## 2026-08-26 增量同步专节（Freshness Update，未重跑完整九维评分）

依 `Balance_Component_Obsidian.md` §19「知识新鲜度」流程执行：本仓库无 `.git` 历史，故以快照日期比对代替 Git Diff——对照 CLAUDE.md 决策日志中 2026-08-22（本报告上次快照）之后的全部条目，逐条核实并只更新受影响的知识，而非整库重建。

**本次覆盖（已验证并更新）：** F1 新增的 A11/B7 Reopen 功能与背景批次架构（AUTO EXPIRY/AUTO CLOSE、Grace Period、EXPIRE/AMEND_EXPIRY_DATE/REOPEN/REVERSAL movementType）；A1/B1 Expiry Date 强制必填与本国营业日校验；5 项 UI-only 必填栏位补齐服务端；真 4-eyes（MakerCheckerConflictError）；CurrencyMismatchError；release() reason_code 覆写 bug 修复；A9 Full-Redeem 服务端补强；A7 Acceptance 余额闸门；Checker 独立搜索排除已 earmarked 候选；Business Case Registry 14→29 案例；数项 Angular UI 缺陷修复（Inquire Events 栏位重建、picker false-zero-flash、Run All Cases 500）；两项死代码清理。新增 27 条规则、修正 5 条既有规则（1 条标记 SUPERSEDED）、新增 12 项知识空白（含 2 项历史空白转为已解决）。逐项清单见 [[Freshness-Update-Log-2026-08-26]]。

**本次未覆盖、诚实披露的范围局限：** (1) 未重新执行完整九维自评分——下方九维评分表格与叙述**仍是 2026-08-22 的原始评分**，未反映本次新增的 27 篇规则笔记与 2 篇功能笔记，实际分数可能因新增内容的证据密度而有正向调整（新增内容 100% 带 file:line 级 Source Evidence），但也可能因为新增笔记尚未经过对抗式验证阶段（本次为单轮 BA/工程验证，非该框架完整的"萃取→对抗式验证"两阶段）而在 Hallucination Control/Code Traceability 上不能直接沿用 9.5 分；(2) 决策表（11-Decision-Tables）、测试场景索引（10-Test-Scenarios）未被本次同步触及——若上述新功能/新规则需要对应的决策表或测试场景条目，属于下一轮同步的候选项，暂记录于此，不在本次强行补齐；(3) `checkredeemsufficiency.md` 归档问题（见下方「可维护性」小节）与英文小节标题的语言一致性问题均未处理，维持原整改计划不变。

## 本次专项核实结果小结

- **16 个具名业务功能主笔记**：`03-Balance-Flows/A-Import/` 与 `B-Export/` 下全部 16 个子文件夹（A1、A2、A3、A3S、A4、A6、A7、A8、A9、A10、B1、B2、B3、B4、B5、B6）均存在与文件夹同名的主笔记,**全部齐全,无缺失**。
  **2026-08-26 更新：** 新增 A11、B7 两个子文件夹与主笔记，现为 **18 个**具名业务功能，同样全部齐全、无缺失（详见 [[A-Import 功能索引]]、[[B-Export 功能索引]]）。
- **`07-API/Function-API Integration Map.md`**：**存在**,对照表完整覆盖全部 16 个功能,回链各功能笔记,并列明 Channel API 层"规格未上线"的关键背景说明。
  **2026-08-26 更新：** 对照表已补上 A11/B7 两行，现完整覆盖全部 18 个功能。
- **`00-Home/Balance Component Overview.md` 的「範疇之外」小节**：**存在**（文件第 35 行),内容详实,给出跨币别外汇、GL 结算过账、Maker/Checker 身份验证、已退役功能代码 A5 四类明确的范畴边界说明,并被其他笔记以 `[[Balance Component Overview#範疇之外]]` 引用为唯一权威来源。需要指出一点：该标题实际文本为「範疇之外（Out of Scope）」,并非仅有「範疇之外」四个字——多出的英文括注不影响其作为权威锚点的功能,但严格按字面核对,标题并非精确等于这四个字。

## 相关知识

- [[Balance-Knowledge-Home]]
- [[Business-Rule-Index]]
- [[Knowledge-Gaps]]
- [[Source-to-Knowledge-Map]]
- [[Balance-Traceability-Matrix]]
- [[Balance Component Overview]]
