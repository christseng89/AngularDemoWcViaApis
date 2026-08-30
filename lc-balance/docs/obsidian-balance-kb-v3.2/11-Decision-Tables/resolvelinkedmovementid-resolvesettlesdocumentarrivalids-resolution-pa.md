---
knowledge_id: resolvelinkedmovementid-resolvesettlesdocumentarrivalids-resolution-pa
title: "resolveLinkedMovementId() / resolveSettlesDocumentArrivalIds() 解析路径"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# resolveLinkedMovementId() / resolveSettlesDocumentArrivalIds() 解析路径

| knownId（ctx 字段）是否存在？ | businessEventId/referencedTransactionId 是否存在？ | 服务端查找结果 | 解析出的 id |
|---|---|---|---|
| 是 | 不适用 | 不适用（未进行查找） | knownId，原样不变——「快速路径」，从不调用 findByBusinessEventId |
| 否 | 否 | 不适用（未进行查找） | null → 调用方返回一个干净的「失败」结果 |
| 否 | 是 | 找到匹配（movementType 属于预期集合 且 status==='PENDING'） | 该匹配 movement 自身的 movementId |
| 否 | 是 | 未找到匹配（例如仅有一个共享同一 businessEventId、但 movementType 不同的 RELEASED 同胞记录） | null → 调用方返回一个干净的「失败」结果，不会把已释放的同胞记录误认为待处理的关联腿 |
| 否 | 是 | findByBusinessEventId 这次 API 调用本身抛出异常 | null（已捕获）→ 干净的「失败」结果，而非未处理的错误 |

## Source Evidence

- `checker-actions.service.ts:233-296`
- `checker-actions.service.spec.ts:80-166,256-297,367-388`

## Related Knowledge

- Angular Checker Panel + Actions
- [[Business-Rule-Index]]
