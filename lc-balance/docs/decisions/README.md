# Balance Component 决策记录

本目录只保存仍然有效、会影响未来实现的业务或架构决策。实施过程和缺陷修复流水记录在 `../history/implementation-log.md`，不要复制到这里。

## 文件命名

```text
YYYY-MM-DD-简短主题.md
```

例如：

```text
2026-08-29-fix-pending-preserves-event-identity.md
```

## 决策模板

```markdown
# 决策标题

- 状态：已确认／已取代
- 日期：YYYY-MM-DD
- 确认者：Reviewer／BA／Architecture
- 影响范围：Domain／API／UI／DB／Accounting

## 背景

需要解决的业务问题或资料冲突。

## 决策

最终必须持续成立的规则。

## 理由

选择该方案的业务、会计或技术原因。

## 影响

需要同步的实现、测试、OAS 和规格。

## 依据

关联规格、映射、代码和测试路径。
```

## 维护规则

- 一项决策一个文件。
- 记录最终规则，不记录每轮尝试。
- 决策变化时保留旧文件并标记“已取代”，链接到新决策。
- 每项决策至少链接一个权威依据和相关测试。
- 不把代码当前行为自动视为已批准业务决策。

## 现有资料

- [2026-08-30 BalanceService façade與原子 Compound Event](2026-08-30-balance-service-facade-and-atomic-compound-events.md)

重构前累计的已确认决策仍可在 `../history/implementation-log.md` 中检索。后续在相关规则被再次修改或正式复核时，逐项提炼为本目录的独立记录，无需一次性复制整个历史日志。
