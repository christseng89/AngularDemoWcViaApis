---
knowledge_id: business-case-registry-backend-orchestrator-business-case-runner-ui-te
title: "Business Case Registry（后端编排器）+ Business Case Runner UI 测试场景"
domain: Balance
category: Test Scenarios
snapshot_date: 2026-08-22
tags:
  - balance
  - test-scenario
---

# Business Case Registry（后端编排器）+ Business Case Runner UI 测试场景

从本主题范围的测试文件中提取了9个测试场景。这些场景所证明的规则详见 Business Case Registry (backend orchestrator) + Business Case Runner UI 与 [[Business-Rule-Index]]。

| 场景 | 前置条件（Given） | 触发操作（When） | 预期结果（Then） | 来源 |
|---|---|---|---|---|
| import-case-1 的完整成功路径覆盖了全部 5 种步骤类型，包括 A4 的 Maker-Submit 关卡 | 通用的 fetch mock 对 POST /balance-movements 返回 201，对 /release 与 /maker-submit 返回 200，且一次 snapshot GET 携带 confirmedBalance/logicalContractId | 调用 POST /api/business-cases/import-case-1/run | 响应中 trace.length === 9（Issue 创建+释放、Amendment 创建+释放、快照、Document Arrival 创建、makerSubmit、释放、最终快照）；fetch 恰好被调用 9 次；balanceContractIdRef 替换正确地将 'bc-1' 解析到了 Amendment 自身的请求上——*余额影响：* trace 展示了 ISSUE 100,000+10% -> AMEND_INCREASE 10,000 -> UTILIZE 50,000（Document Arrival）-> A4 Settlement 的流程，依据该案例自身的快照标签，最终 LC Confirmed 达到 71,000 *容差/汇率：* 依据 Import Case 1 自身的请求载荷，在 ISSUE 时应用了 10% 的 tolerancePct | `backend/test/server.test.js:100-137` |
| parentLogicalContractIdRef 恰好触发一次额外的 GET 调用以解析 logicalContractId | import-case-2 的 Acceptance CREATE 步骤携带 parentLogicalContractIdRef: 'lc' | 运行该案例 | Acceptance 的 createMovement 请求自身的 parentLogicalContractId 匹配 /^lct-bc-/（通过 GET .../balance 解析得到），原始的 parentLogicalContractIdRef 字段会在 POST 之前被删除，且 fetch 总调用次数等于 case2.steps.length + 1（那一次额外的解析 GET） | `backend/test/server.test.js:140-157` |
| referencedTransactionIdRef 会就地解析，不产生任何额外调用；重复使用同一个 parentLogicalContractIdRef 会被缓存 | export-case-6 的 Honour 步骤通过 referencedTransactionIdRef 引用了此前已捕获的 Present Docs（examination）步骤，且 'examination' 与 'dueFromIssuingBank' 两个步骤引用的是同一个 parentLogicalContractIdRef（'conf'） | 运行该案例 | honour.request.referencedTransactionId 等于 examination.response.movementId，且该解析未产生任何额外的 fetch 调用；fetch 总调用次数等于（可发起请求的步骤数）+ 1，而不是 +2——证明了 parentLogicalContractIdRef 缓存机制防止了对同一个 ref 第二次使用时再次发起 GET | `backend/test/server.test.js:159-184` |
| import-case-6 的三个 makerSubmit 步骤都各自先于其对应的 release，区别于普通的 release 调用 | import-case-6 有 3 笔 Document Arrival（B01/B02/B03），每笔都需要先经过各自的 makerSubmit 才能 release | 运行该案例 | 恰好存在 3 条 type 为 'makerSubmit' 的 trace 记录，均为 {ok:true, status:200, response:{status:'PENDING', makerSubmittedBy:'maker1'}}；B01 的 makerSubmit 步骤在案例自身步骤列表中的索引严格早于其自身 B01 release 步骤的索引——*余额影响：* 证实 LC Confirmed 为 100,000，在任何 A4 结算完成之前 Available 降至 46,000（3 笔 Document Arrival 共计 54,000 仍处于 Pending），全部 3 笔结算完成后 Confirmed 变为 46,000 | `backend/test/server.test.js:186-206` |
| B3（Present Docs）会真正先于 B4 提交 Honour 之前释放——顺序不变量 | export-case-6 的步骤列表 | 运行该案例 | 不会出现任何 type 为 'acknowledge' 的 trace 记录；恰好有一条 trace 记录满足 type='release' 且 label 以 'Checker releases Present Docs (' 开头，内容为 {ok:true, status:200, response:{status:'RELEASED'}}；该 release 步骤在案例定义中自身的索引严格早于 Honour 的 createMovement 步骤自身的索引 | `backend/test/server.test.js:215-234` |
| note 步骤从不触发任何 fetch 调用 | import-case-3 至少包含一个 'note' 步骤（EBL/IBL 仅属于 Loan Component 范畴） | 运行该案例 | 每一条 note trace 记录都恰好是 {type:'note', label:<string>}；fetch 总调用次数等于可发起请求（非 note）的步骤数 + 1（SG 自身的 parentLogicalContractIdRef 解析） | `backend/test/server.test.js:236-256` |
| 当自身的 createMovement 未返回 movementId 时，release 步骤会被跳过而不是崩溃 | LC Issue 自身的 createMovement 调用被模拟为一次 409 业务拒绝（返回 balanceContractId 但不返回 movementId） | 运行 import-case-1 | trace 仍有 9 条记录；引用该失败 Issue 的 release 步骤为 {skipped:true, reason: 匹配 /No movementId captured under "lc"/}；fetch 恰好被调用 8 次（9 个步骤减去被跳过的 1 个）；下游的 Amendment 步骤仍会替换该失败步骤自身的 balanceContractId（'bc-lc'），且自身报告 ok:true——*余额影响：* 展示了编排器的容错能力：单个被拒绝的步骤不会破坏或中止多步骤案例 trace 的其余部分 | `backend/test/server.test.js:258-306` |
| resolveLogicalContractId 失败时会以通用的 500 呈现给外部，真实细节仅记录在服务端日志中 | 微服务的 snapshot GET（仅用于解析 logicalContractId）返回 500 | 运行 import-case-2 | 该端点向调用方返回 500 {code:'ORCHESTRATION_ERROR', message:'An internal error occurred while running this business case.'}，同时服务端会调用 console.error，记录案例 id 以及真实的 'Could not resolve logicalContractId for "lc"' 细节——客户端永远不会看到内部报错文本（BAL-117） | `backend/test/server.test.js:344-372` |
| 该运行端点带有生效中的速率限制器（rate limiter） | 一次正常成功的 import-case-1 运行 | 检查响应头 | ratelimit-limit 头等于 '120'（依据 BAL-118 的 120 req/60s 窗口），且不存在旧版的 x-ratelimit-limit 头（legacyHeaders:false） | `backend/test/server.test.js:413-423` |
