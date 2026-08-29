# CLAUDE 文档分层重构实施计划

> **For Codex:** 按本计划逐项实施并在完成后检查文档链接与变更范围。

**目标：** 将根目录超长 `CLAUDE.md` 重构为按目录生效的精简规则和可维护的专题文档，同时完整保留历史内容。

**架构：** 根文件只保留仓库范围、权威来源、关键不变量、命令和文档导航。Angular UI、微服务、Domain、数据库与测试规则下沉到相应目录；通用工程标准、稳定业务规则、架构和历史记录放入 `docs/`。

**技术栈：** Markdown、Angular 17、TypeScript、Node.js、Express、SQLite、Jest。

---

### 任务 1：保留原始内容

- 将原 `CLAUDE.md` 完整移动到 `docs/history/implementation-log.md`。
- 在归档文件顶部标明其只用于历史检索，不再作为当前开发指令。

### 任务 2：建立仓库级入口

- 创建精简的根 `CLAUDE.md`。
- 保留范围、权威来源顺序、核心不变量、实际命令和分层文档链接。

### 任务 3：建立分层规则

- 为 Angular transaction builder、Balance Component 微服务、Domain、DB 和测试目录建立局部 `CLAUDE.md`。
- 每个文件只描述该目录特有的职责、规则与验证要求。

### 任务 4：建立专题文档

- 创建架构、工程标准、Balance 业务规则、决策索引和分析资料索引。
- 避免在不同文件重复完整规则，以链接方式引用权威位置。

### 任务 5：验证

- 检查所有新文档存在且链接目标有效。
- 检查根 `CLAUDE.md` 保持精简。
- 检查 Git diff 只包含 `lc-balance` 内的文档变化。
