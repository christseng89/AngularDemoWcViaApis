---
knowledge_id: Balance-Component-Overview
title: '余额组件概览'
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: 'N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]'
snapshot_date: 2026-09-01
tags:
  - balance
  - overview
---

# 余额组件概览

Balance Component 是贸易金融领域的**或有负债／表外风险敞口台账**：它以 [[BalanceContract]]/[[BalanceMovement]] 记录的形式，追踪信用证（LC）、装运保函（Shipping Guarantee）、承兑/DPU（Acceptance/DPU）、UPAS，以及出口保兑（Export Confirmation）的未平仓风险敞口，并强制执行贯穿每一次状态变更的 Maker/Checker（双人复核／四眼原则）管控。它的范畴边界十分明确：**"Balance Component 只负责 Contingent Liability（或有负债）"**——即风险敞口的追踪，而非结算／总账（GL）过账，后者是姊妹组件 Payment/Charge Component 的职责。

## 涵盖的工具类型

完整枚举见 [[InstrumentType]]。以业务语言概括：进口信用证（`IPLC_LC`）与出口信用证（`EPLC_LC`）、进口/出口承兑（Usance）、装运保函（SHGT，让买方能在正本单据到达前提货）、出口保兑（Export Confirmation，保兑行自身的承诺，其过渡期风险敞口以 Present Docs Earmark 形式记账），以及保兑在 Honour/Accept 后转化出的表内资产类对应工具。

## 三个各自独立版本管理的组成部分

这不是一个共享进程内的单体应用，而是三个部分通过 HTTP 互相通信：

1. **`microservices/balance-component/`** —— 真正的台账（ledger）。`service/balanceService.ts` 编排两个 Express 路由；`domain/` 存放会计/风险敞口逻辑；`db/`+`store/` 是持久化层（`node:sqlite`）。
2. **`backend/`**（Express **中台** 编排层）—— 针对整套 Import/Export **Business Case**（业务案例）的声明式登记表（`backend/data/businessCases.js`），逐条重放调用微服务，做到「点一下即可端到端跑完一个完整、逼真的场景」。
3. **Angular `src/app/`** —— 两个 UI 界面：**`business-case-runner/`**（一键运行一整个已登记的 Business Case）与 **`transaction-builder/`**（更底层的 Maker/Checker 表单，直接向微服务提交单笔 movement）——另外还有一个只读的 **Inquire Events** 模式，用于合并展示一张信用证跨所有子台账的完整时间线。

## 如何阅读本知识库

先从 [[Balance Architecture]] 了解技术形态，再看 [[BalanceContract]]/[[BalanceMovement]]/[[InstrumentType]] 了解核心领域模型，接着看 [[Exposure Model]]/[[Off-Balance-Sheet Exposure]]/[[Tolerance Processing]] 了解会计规则，最后看 [[Maker Checker Lifecycle]] 了解四眼管控层。[[Business-Rule-Index]] 是可逐条追溯的完整规则清单；[[Balance-Traceability-Matrix]] 将每条规则关联回其实现代码与测试。

## 範疇之外

本节是全知识库判断「什么不属于 Balance Component」的唯一权威来源；其他笔记以 `[[Balance Component Overview#範疇之外]]` 链接回此处，不再各自重复展开。

**跨币别外汇换算不在本组件职责范围内。** Balance Component 的容差／可用余额上限逻辑（见 [[Tolerance Processing]]）自始至终只在单一币别（即信用证自身的交易币别）内运作，本身并不执行任何跨币别的外汇换算；十进制精度校验虽在本组件内实现（`money.ts`、`CURRENCY_MINOR_UNITS`/`CURRENCY_DECIMALS`），但真正的多币别兑换属于姊妹组件 Payment Component 的职责范围。详见 [[Tolerance Processing]]。

**本组件只追踪或有／表外风险敞口，不执行真正的表内总账（GL）结算过账。** 组件所展示的每一组 Dr/Cr 分录对都只是备忘性质的或有科目，从不触及正式财务报表科目；Honour 后产生的已放款应收款、真正的承兑/DPU 负债、保证金、手续费、ECL 减值计提、结算与往来账（nostro）等表内环节，即便与同一笔交易同源，也被明确排除在本组件的记账范围之外——`deriveContingentAccountEntry()` 对这些表内资产类工具（如 `EPLC_DUE_FROM_ISSUING_BANK`、`EPLC_ACCEPTANCE_REIMB_RECEIVABLE`、`EPLC_EXPORT_BILLS_DISCOUNTED`）一律直接返回 null。API 层面同样明确声明：IBL/EBL 及任何实际放款/贴现风险敞口、利息/应计计算属于 Loan Component 的职责，GL 科目对应本服务只做原样透传、不做解读。详见 [[Off-Balance-Sheet Exposure]] 及相关的范畴边界笔记。

**系统不强制验证 Maker 与 Checker 是否为不同的真实使用者身份。** 演示数据中所有 createMovement 请求固定使用 `createdBy: 'maker1'`，release/makerSubmit 步骤固定使用 `'checker1'`/`'maker1'`；`release()` 推导实际 Checker 身份时也只是一个简化的双角色模型（`createdBy` 为 `maker1` 则记为 `checker1`，否则记为 `checker2'`）。本系统并未建模任何真实身份验证或职责分离（Segregation of Duties）机制，这属于银行外部授权政策的范畴，不在本组件之内。

现行进口功能为 A1、A2、A3、A3S、A4、A6、A7、A8、A9、A10、A11；出口功能为 B1–B7。A11／B7 为 Reopen 功能。

## 2026-08-30 现行行为入口

最新生命周期、Tight LC Balance、Transaction Index、原子 compound 与验证基准见 [[Freshness-Update-Log-2026-08-30]]。交易选择组合身份见 [[Transaction Index Selection Contract]]，服务端职责拆分见 [[BalanceService Facade Architecture]]。

Transaction Index 是候选清单；API 在 Maker Submit/create 与 Checker Release 两个阶段都重新验证当前 eligibility，确保 UI 与直接 API caller 遵循同一套状态规则。

## 2026-09-01 source sync

最新功能目录、B5 单一 Settlement、服务端资格重检、Business Cases 与负 Tight Balance 自动 A02/B02 修复见 [[Freshness-Update-Log-2026-09-01]]；A2／B2 Amount × Tolerance 完整上限重算及币别四舍五入见 [[Freshness-Update-Log-2026-09-03]]。

## 相关知识

- [[Balance Architecture]]
- [[BalanceContract]]
- [[BalanceMovement]]
- [[InstrumentType]]
- [[Exposure Model]]
- [[Maker Checker Lifecycle]]
- [[Balance-Knowledge-Home]]
