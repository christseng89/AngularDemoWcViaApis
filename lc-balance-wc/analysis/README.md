# Balance Component 分析资料索引

本目录保存 Balance Component 的业务、会计、API、数据库和测试分析资料。不要根据文件日期或格式自动推断权威性；冲突时遵循根 `CLAUDE.md` 的来源优先级，并记录待确认事项。

## API 合约

- `balance-component-api.yaml`：Balance Component 微服务 OpenAPI。
- `balance-component-channel-api.yaml`：Web／Mobile Channel API。

API 行为变化时同步 schema、版本／changelog、实现、客户端和合约测试。

2026-08-31 当前版本：微服务 OAS `1.42.1`，Channel OAS `1.9.0`。微服务 OAS 的
`x-client-retry-policy` 记录 Angular／Web Component client 的安全读取重试策略；这是 client operational
metadata，不是 request field，也不表示服务端自动重试。成功 response shape、endpoint 与 Channel／DOM
contract 均未改变。详细设置见 `../docs/http-retry-policy.md`。

Maker Submit 的 validation／HTTP 4xx 显示分类属于 Angular／Web Component presentation policy；既有 OAS Error schema 与 400 responses 已涵盖服务端 contract，因此本次 UI 修正不提升 OAS 或 DOM contract 版本。

## 基础业务规格

- `TF_Balance_Component_Spec-en.docx`／`TF_Balance_Component_Spec-zh.docx`
- `TF_Contingent_Liability_Lifecycle-en.docx`／`TF_Contingent_Liability_Lifecycle-zh.docx`
- `TF_Balance_Component_Mapping-en.xlsx`／`TF_Balance_Component_Mapping-zh.xlsx`
- `Balance-Figures-Calculation-Logic.md` 及中英文衍生版本
- `contingent-liability-ledger.html`

`.docx` 可用 Pandoc 转为纯文字进行只读核对。存在 Markdown／DOCX 配对时，优先修改已建立维护流程的 Markdown 源，再重新生成 DOCX；没有文本源时不要直接进行不透明的二进制编辑。

## 专题需求与提案

文件名以 `Balance-Component-` 开头的 Markdown／DOCX 文档包括：

- Business Rule Decisions
- Maker／Checker、Fix Pending、Delete Pending
- Expiry、Auto Close、Reopen
- Inquire Events 与 Event Seq
- DB Design／Optimization
- Test Case Proposal 和验证总结

提案不等于已批准规则。引用时必须标明其状态，并与最新 Reviewer／BA 决策和实现测试交叉核对。

## 外部参考

- `standing-microservice-reference/`：营业日服务参考资料和样例数据。
- `.bak-*`：历史备份，不是当前权威文件。

## 维护规则

- 新文档标题和文件名应明确主题、语言、状态和必要日期。
- 避免同时维护多个没有来源关系的“最终版”。
- 决策结果写入 `../docs/decisions/`；实施流水不要继续加入根 `CLAUDE.md`。
- 文档更改后检查 OAS、代码注释、测试名称和 Business Case Registry 是否仍一致。
- 现行行为快速基准见 `../docs/current-behavior.md`；历史 plans、扫描报告和 Obsidian 快照是衍生资料，
  不应覆盖现行 OAS／业务规则。
