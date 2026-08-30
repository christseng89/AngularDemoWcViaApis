---
knowledge_id: fixed-demo-maker-checker-identities-no-real-auth-modeled
title: "固定的演示用 Maker/Checker 身份——未建模真实身份验证"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — 本次分析快照中无 .git 历史记录，详见 [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# 固定的演示用 Maker/Checker 身份——未建模真实身份验证

所有 createMovement 请求固定使用 createdBy: 'maker1'；release/makerSubmit 步骤固定使用 releasedBy/makerSubmittedBy 为 'checker1'/'maker1'。本系统不强制验证 Maker 与 Checker 是否为不同的真实使用者，这属于范畴之外的银行外部授权政策问题。完整的范畴判断说明见 [[Balance Component Overview#范畴之外]] 的"范畴之外"小节，此处不重复展开。

## Source Evidence

- `backend/data/businessCases.js:38-46`

## 2026-08-26 补充更正——「不强制验证」这一说法已被业务反转，请勿再按原文字面理解

> [!warning] 本笔记原文的核心论断已被业务反转（2026-08-24 起生效）
> 本笔记正文所写的「本系统不强制验证 Maker 与 Checker 是否为不同的真实使用者，这属于范畴之外的银行外部授权政策问题」，对应的正是 `domain/statusTransition.ts` 2026-08-14 版本头部注释所记载的原始立场——**该立场现已被业务方明确反转（2026-08-24 业务确认，真正的 4-eyes 分离）**，不再成立，保留在上方仅作历史沿革记录，不代表当前实际行为。
>
> 现状：对 RELEASE、REJECT 以及 A3/A3S 的 acknowledge（Checker 确认）三个动作，微服务现在会真正比较 `createdBy` 与实际操作者（`releasedBy`/`acknowledgedBy`），两者相同即拒绝（`MakerCheckerConflictError`，HTTP 409 `MAKER_CHECKER_CONFLICT`）——参见 [[MAKER-CHECKER-RULE-060]]（RELEASE/REJECT）与 [[MAKER-CHECKER-RULE-061]]（acknowledgeArrival()）。CANCEL/EDIT 不受影响：CANCEL 是 Maker 对自己 PENDING 记录的 Error Correction，`createdBy === actingUser` 在那里是预期的正常情形。
>
> 本笔记原文所述的「所有 createMovement 请求固定使用 createdBy: 'maker1'；release/makerSubmit 步骤固定使用 releasedBy/makerSubmittedBy 为 'checker1'/'maker1'」这一*演示身份固定值*本身仍然属实、未受影响——`backend/data/businessCases.js` 中 Maker/Checker 身份始终保持不同（'maker1' vs. 'checker1'），因此这套既有演示数据在新规则下依然能正常运行，不会触发新的 `MAKER_CHECKER_CONFLICT`。变化的只是「是否强制校验」这一件事，而不是演示数据本身的身份取值。
>
> 「本系统完全没有真正的身份认证/鉴权」这一更底层的事实（Maker/Checker 字段仍是调用方自由填写的字符串，没有登录态或角色系统）本身没有变化——变化的只是新增了一条针对这些自由字符串的**业务逻辑层比较**，而不是引入了真正的身份认证。

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
