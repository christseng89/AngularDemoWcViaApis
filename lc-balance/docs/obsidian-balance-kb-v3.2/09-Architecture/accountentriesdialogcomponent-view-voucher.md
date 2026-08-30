---
knowledge_id: accountentriesdialogcomponent-view-voucher
title: "AccountEntriesDialogComponent（“查看凭证”）"
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

# AccountEntriesDialogComponent（“查看凭证”）

纯展示型的独立对话框（Input：movement、instrumentType、phase；Output：closed），将一笔 movement 不可变、一次性生成的 contingentAccountEntry 渲染为借/贷（Dr/Cr）配对表（先 Dr 行再 Cr 行，两行金额与币种相同，因为这是单一币种的或有分录，而非多腿过账）。若 contingentAccountEntry 为 null（例如 B3/EPLC_EXAMINATION、MEMO_ONLY，属于或有会计范畴之外），则显示“该事件暂无记录的凭证分录。”作为替代。展示 displayMovementType()/displayStatus()/statusBadgeClass()/statusBadgeIcon()，均委托给 balance-component.model.ts 中的共享纯函数，并透传自身的 `phase` 输入，确保“finalize”行绝不会被误标为 EARMARKED。

## 证据来源

- `account-entries-dialog.component.html:17-50`
- `account-entries-dialog.component.ts`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
