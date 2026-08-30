---
knowledge_id: generic-step-executor-trace-generation-runcase
title: "通用步骤执行器／轨迹生成（runCase()）"
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

# 通用步骤执行器／轨迹生成（runCase()）

runCase() 按顺序遍历一个案例的步骤清单，依据 step.type（note / createMovement / release|makerSubmit / snapshot）进行分派，构建出一个扁平的 trace[] 数组，供 UI 直接渲染。遇到无法识别的 step.type 会同步抛出异常（在真实注册表中永远不会触发，只有通过合成的测试步骤才能触发）。若某个 release/makerSubmit 步骤所引用的 createMovement 从未捕获到 movementId（例如该步骤使用了 expectError 且确实失败），则该步骤会被标记为 {skipped:true, reason}，不会产生任何下游 API 调用，但案例的其余部分会继续执行。

## Source Evidence

- `backend/server.js:64-137`
- `backend/test/runCase.test.js:94-153`
- `backend/test/server.test.js:258-306`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
