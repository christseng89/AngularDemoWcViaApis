---
knowledge_id: rate-limiter-false-positive-artifact-when-business-cases-are-run-back-
title: "Business Case 连续执行时出现的速率限制器误报现象"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# Business Case 连续执行时出现的速率限制器误报现象

多次验证记录都指出，快速连续执行 Business Case Registry 中的条目（例如一口气执行全部 14 个，或 21 个以上）可能会在 1-2 个案例上触发短暂的 ORCHESTRATION_ERROR / fetch failed，原因是微服务自身的每分钟 120 次请求速率限制器，或是编排器进程刚重启后的预热竞态——每次都会通过在冷却/预热之后单独重跑受影响的案例来重新确认这并非回归问题，重跑后该案例会以零个 ok:false 步骤干净通过。

## Source Evidence

- `Balance-Component-Export-Case-2-4-Tenor-Fix-Verification-2026-08-22.md:62-67`
- `Quality-report-balance.md:540-545`
- `REGRESSION-BASELINE.md:29-34`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]

## 2026-08-26 更新——三个独立根因确认并修复，此前记录的"误报"实为真实容量/代码缺陷

本文档原先将"Run All Cases 连续执行触发速率限制"定性为一种良性的、重跑即可消失的误报/预热竞态现象。2026-08-26 复核后确认：该现象背后是三个独立的真实问题，而非单纯的误报，现已全部修复：

1. **`backend/server.js` 以 `node server.js`（无 `--watch`）启动**——`require()` 缓存住了启动时的 `businessCases.js`，登记表文件被编辑后，若不重启该进程，服务端仍在跑旧版本。`backend/package.json` 的 `start` 脚本证实确无 `--watch`；`microservices/balance-component/` 一侧的 `npm run dev`（`node --watch -r ts-node/register src/server.ts`）不受此问题影响。
2. **`/balance-movements` 限流器（`microservices/balance-component/src/app.ts`）从 120 次/60 秒提高到 1000 次/60 秒**——120 是按登记表最初约 10 个用例估算的，而一次完整"Run All Cases"点击会在近零延迟的 localhost 上连续触发 100+ 次 `/balance-movements` 调用，轻易撞到旧上限，这是被限流器误伤的正常用量，不是滥用。
3. **`server.js` 通用步骤执行器（`resolveLogicalContractId()` 及 createMovement 步骤自身的引用解析逻辑）在解引用被引用步骤的 `.response.balanceContractId`/`.response.movementId` 之前，不检查该步骤是否真正成功**——若被引用的 `createMovement` 因限流或业务拒绝而失败，这里会抛出一个难以诊断的裸 TypeError，最终表现为一个泛化的 500。现已加上显式的 `!referenced?.response?.balanceContractId` / `!entry.response?.movementId` 判空guard，改为抛出说明性错误。详见 [[runcase-generic-step-executor-dispatch]] 的对应更新。

此外，"Run All 10 Cases"按钮文案已更正为"Run All Cases"（登记表早已超过 10 个用例）——`business-case-runner.component.html:20`，另见 [[business-case-runner-ui-single-run-vs-run-all-sequential-chain]]。

**状态更新**：本文档记录的现象不再是单纯的"误报"，而是一个已诊断、已修复的真实三重缺陷；上文原始描述保留存档，但不应再被当作当前行为的解释——三个根因均已修复，重跑不再是绕过问题的唯一手段。

### 证据来源（本次更新）
- `backend/package.json:6-8`（`"start": "node server.js"`，无 `--watch`）
- `microservices/balance-component/src/app.ts:26-37`（限流器注释 + `limit: 1000`）
- `backend/server.js:36-51`（`resolveLogicalContractId()` 的判空guard与注释）
- `backend/server.js:85-113`（createMovement 步骤引用解析的判空guard）
- `src/app/business-case-runner/business-case-runner.component.html:20`
