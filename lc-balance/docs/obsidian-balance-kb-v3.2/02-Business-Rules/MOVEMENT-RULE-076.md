---
knowledge_id: MOVEMENT-RULE-076
title: "A1/B1 ISSUE 的 Expiry Date 必须是真实的本国（台湾）营业日——先查周末再查假日，超出 2026-2028 覆盖范围时视为「未知」而非拒绝"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-26
tags:
  - balance
  - movement
  - confirmed
  - expiry-date
  - domestic-calendar
  - a1
  - b1
---

# MOVEMENT-RULE-076 — A1/B1 ISSUE 的 Expiry Date 必须是真实的本国（台湾）营业日——先查周末再查假日，超出 2026-2028 覆盖范围时视为「未知」而非拒绝

## Status
CONFIRMED

## Business Rule
2026-08-26 用户直接指示（"Expiry Date也不可以是本国的假日或周末... FOR A1 B1... UI API都需要"）：在 [[MOVEMENT-RULE-075]] 的「必填」基础上，进一步要求该 Expiry Date 必须落在真实的本国（台湾）营业日上，不得是周六/周日，也不得是公众假期。此为全新领域模块 `domesticCalendar.ts`，微服务端（`microservices/balance-component/src/domain/domesticCalendar.ts`）与 Angular 端（`src/app/transaction-builder/domestic-calendar.ts`）各自维护一份手动同步的副本（两者是各自独立部署单元，非共享 import，与该档案自身沿用 `autoCloseGracePeriod.ts` 早已确立的"同仓库、不跨服务调用"惯例一致）。日历数据复用 `microservices/business-days-mock/data/calendar.json` 已经为 F1 §13.5 AUTO CLOSE Grace Period Phase 2 参考素材准备的同一份台湾假期数据（仅涵盖 2026-2028 年，为示例性质，非权威数据源）。

三个导出函式：`isWeekend(dateStr)`（纯星期几运算，对任何年份都成立）、`knownHolidayName(dateStr)`（Map 查找，超出覆盖范围一律返回 `null`）、`domesticNonBusinessDayReason(dateStr)`（组合两者，`null` 代表是真正营业日，否则返回人类可读原因）。**检查顺序为先周末、后假日**——`domesticNonBusinessDayReason()` 先呼叫 `isWeekend()`，只有非周末时才去查 `knownHolidayName()`。此顺序刻意与 `microservices/business-days-mock/server.js` 自身的 `nonBusinessDayReason()` 检查顺序一致（该 mock 服务先检查 `calendar.weekendDays`，再查 `calendar.holidays`）。两种顺序都会得到相同的「是否算营业日」结论，唯一的差别是——当一个固定的国定假日恰好落在周末上时（如 2027-10-10 國慶日恰为周日），回报的原因文字是 `'Saturday/Sunday'`，而非假日名称「國慶日」。此行为有专门的回归测试锁定（`domesticCalendar.test.ts` 与 Angular 端 `domestic-calendar.spec.ts` 均以 `2027-10-10` 为例），防止未来重构不慎把检查顺序颠倒回「先假日、后周末」。

**超出 2026-2028 覆盖范围的年份被刻意视为「未知」，而非拒绝**——`knownHolidayName()` 对覆盖范围外的日期一律返回 `null`（没有可比对的假日资料，而非"该日期不合法"），但 `isWeekend()` 的星期几运算对任何年份都仍然有效，因此覆盖范围外的日期仍会被挡下「周末」，只是不会被挡下「未知的假日」。这是刻意的"宁可漏放、不可错挡"（don't false-reject）默认姿态，因为 Expiry Date 是人工键入的栏位，静默放行一个无法验证的极远期日期，被认为比挡下每一笔多年期限的信用证更安全。**这与同一代码库中兄弟服务 `business-days-mock/server.js` 的 fail-closed `CALENDAR_RANGE_EXCEEDED` 守卫刚好是相反的失效模式**——该 mock 服务的调用方（AUTO CLOSE 批次扫描）若拿到一个无法验证的答案就完全无法安全地继续往下走，因此选择直接拒绝（422）；而这里的调用方是人工输入的单一日期栏位，两者对"验证不了怎么办"给出了不同但各自合理的答案，属已记录的刻意设计差异，非不一致缺陷。

服务端强制点：Maker `createMovement()` 经 `assertExpiryDateIsBusinessDay()`；Checker `release()` 对已持久化的 `contract.expiryDate` 做同一逻辑的复检（但注意：此复检以 `contract.expiryDate` 为真值门控，若该值本身被绕过清空则不会触发任何检查——见 [[MOVEMENT-RULE-075]] 关于此非对称之处的说明）。Angular 端 `submit-rules.ts` 有对应的镜像守卫，仅为提交前的即时体验优化，非权威校验。

## Conditions
`req.movementType === 'ISSUE' && ROOT_INSTRUMENT_TYPES.has(req.instrumentType) && req.expiryDate` 存在时，`domesticNonBusinessDayReason(req.expiryDate) !== null`（即该日期是周末，或落在 2026-2028 覆盖范围内的已知公众假期上）

## Result
`createMovement()`／`release()` 抛出 `400 RequestValidationError`："expiryDate ${date} falls on a domestic non-business day (${reason}) — pick a genuine business day."，`reason` 为 `'Saturday/Sunday'` 或具体假日名称（如「元旦」）

## Example
- `expiryDate='2026-01-01'`（元旦）→ 拒绝，原因「元旦」。
- `expiryDate='2026-01-03'`（周六）→ 拒绝，原因「Saturday/Sunday」。
- `expiryDate='2026-01-08'`（周四，非假日）→ 通过。
- `expiryDate='2027-10-10'`（國慶日，恰为周日）→ 拒绝，原因回报为「Saturday/Sunday」而非「國慶日」——检查顺序回归测试用例。
- `expiryDate='2099-01-03'`（覆盖范围外的周六）→ 仍拒绝，原因「Saturday/Sunday」（星期几运算对任何年份都有效）。
- `expiryDate='2099-01-05'`（覆盖范围外的周一，非周末）→ 通过（假日检查在此年份"查无资料"，静默视为无假日，而非拒绝该年份本身）。

## Verification Note
已完整阅读 `microservices/balance-component/src/domain/domesticCalendar.ts`（全档 96 行，含其顶部完整决策脉络说明）与其单元测试 `domesticCalendar.test.ts`（全档 52 行，逐一核实周末/假日/组合/超出范围/检查顺序共 12 个测试案例）；已核实 Angular 端手动同步副本 `src/app/transaction-builder/domestic-calendar.ts`（全档 78 行，内容与微服务端一致）及其测试 `domestic-calendar.spec.ts`（第 41-43 行的 2027-10-10 回归测试，断言与微服务端测试完全对应）。已核实 `balanceService.ts` 中 `assertExpiryDateIsBusinessDay()`（第 1509-1522 行一带）及 `release()` 内对应复检段（第 1779-1786 行）。已核实兄弟服务 `microservices/business-days-mock/server.js` 的 `nonBusinessDayReason()`（第 69-79 行）确实先查 `weekendDays` 再查 `holidays`，与本规则声称的一致检查顺序相符；亦核实该 mock 服务自身的 `CALENDAR_RANGE_EXCEEDED` fail-closed 守卫（第 90-133 行一带）与本规则"未知即放行"的姿态方向相反，两者均为文件自身注释明确交代的刻意设计。

## Source Evidence

实现:
- `microservices/balance-component/src/domain/domesticCalendar.ts:1-96`（全档，`isWeekend`/`knownHolidayName`/`domesticNonBusinessDayReason`）
- `microservices/balance-component/src/service/balanceService.ts:1509-1522`（`assertExpiryDateIsBusinessDay()`）
- `microservices/balance-component/src/service/balanceService.ts:1779-1786`（release() 复检段）
- `src/app/transaction-builder/domestic-calendar.ts:1-78`（Angular 手动同步副本）
- `src/app/transaction-builder/submit-rules.ts:85-93`（Angular Submit 时镜像守卫）
- `microservices/business-days-mock/server.js:69-79,90-133`（对照参考：检查顺序一致，覆盖范围外失效模式相反）

测试:
- `microservices/balance-component/test/unit/domain/domesticCalendar.test.ts:1-52`（全档，含第 41-45 行 2027-10-10 检查顺序回归测试）
- `microservices/balance-component/test/unit/service/domesticBusinessDayRule.test.ts:1-179`（全档，Maker+Checker 端到端覆盖，含 release() 绕过复检测试）
- `src/app/transaction-builder/domestic-calendar.spec.ts:41-43`（2027-10-10 回归测试，Angular 端）
- `src/app/transaction-builder/submit-rules.spec.ts:735,744,755`（Submit 层三个断言：假日、周末、AMEND_EXPIRY_DATE 路径下的等价案例）

## Related Knowledge
- [[MOVEMENT-RULE-075]] — Expiry Date 强制必填（同一校验点的前一步检查）
- [[A1-LC-Issue]]
- [[B1-Confirm-LC]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
