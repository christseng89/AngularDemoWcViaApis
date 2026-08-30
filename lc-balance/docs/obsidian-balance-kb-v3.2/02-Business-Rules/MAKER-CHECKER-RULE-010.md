---
knowledge_id: MAKER-CHECKER-RULE-010
title: "即期（Sight）IPLC_LC/UTILIZE（A4）在 Checker 放行前必须先有一次真实的 Maker Submit——服务端强制执行，仅限 tenorType 范畴（BAL-123）"
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

# MAKER-CHECKER-RULE-010 — 即期（Sight）IPLC_LC/UTILIZE（A4）在 Checker 放行前必须先有一次真实的 Maker Submit——服务端强制执行，仅限 tenorType 范畴（BAL-123）

## 状态
CONFIRMED

## 业务规则
release() 会推导出 isSightUtilizeFinalize = (movementType==='UTILIZE' && contract.instrumentType==='IPLC_LC' && contract.tenorType==='SIGHT')。若此值为真，且 movement.makerSubmittedAt 尚未设置，release() 会抛出 IllegalStateTransitionError（409），指示调用方须先呼叫 POST .../maker-submit。此规则范畴严格限定于即期（Sight）tenor 的 IPLC_LC/UTILIZE——Usance LC 自身的 UTILIZE 是经由 A6 的复合式、以 referencedTransactionId 为基础的流程放行，该流程从不调用 submitByMaker()，因此不受此规则影响（此处 contract.tenorType 绝不会是 'SIGHT'）；其 parent 从未显式声明 tenorType 的 movement 同样不受影响。Business Case Registry 自身的生成案例也印证了这一点：即期案例会在 release 前插入一个 makerSubmit 步骤，Usance 案例则从 createMovement 直接进入 release（createAndRelease，不含 makerSubmit）。

## 适用条件
movement.instrumentType===IPLC_LC，movementType===UTILIZE，parent contract.tenorType===SIGHT，且 makerSubmittedAt 为 null。

## 结果
返回 409 ILLEGAL_STATE_TRANSITION，提示"需要先进行 Maker Submit"；该 movement 会持续保持 PENDING 状态，直到 maker-submit 被调用，之后 release 才会正常进行。

## 示例
一笔针对即期 IPLC_LC 的 Document Arrival UTILIZE，若从未经由 A4 自身的 submitByMaker() 端点做过 Maker Submit，当 Checker 尝试直接放行时，会抛出 IllegalStateTransitionError。此项修复在当时全部 14 笔（后增至 21 笔）Business Case Registry 案例中都进行了实测验证——只有一个测试固件需要额外补上一次 maker-submit 调用。

## 核实说明
合并了从 5 个不同角度描述同一规则的近乎重复候选项（服务端实现、app.test.ts 端对端测试、OAS 规格重述、business-case-registry 使用模式、品质补救历史的事后回顾）为同一条。CLAUDE.md 自身关于 BAL-122/BAL-123 的决策日志条目给予了有力佐证，其内容逐字独立确认了 tenorType==='SIGHT' 的范畴限定，以及 Usance 豁免的理由。凭借实现、测试与两份独立文件来源的一致且深入的证据，确实为 CONFIRMED。

## 来源证据

实现代码：
- `microservices/balance-component/src/service/balanceService.ts:1117-1156`
- `backend/data/businessCases.js:123-134,297-302,435-439,640-645,1190-1191`

测试：
- `microservices/balance-component/test/unit/app.test.ts:2737-2811`
- `backend/test/server.test.js:100-137`

## 相关知识
- [[Maker Checker Lifecycle]]
- guardSecondaryAction() — acknowledgeArrival()/submitByMaker() 共用的样式
- A4 自身的 Checker Release 在其自身的 Maker Submit 存在之前，会被客户端阻止（纵深防御式 UX 检查）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
