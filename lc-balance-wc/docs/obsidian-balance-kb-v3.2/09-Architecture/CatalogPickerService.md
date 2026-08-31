---
knowledge_id: catalogpickerservice
title: "CatalogPickerService"
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

# CatalogPickerService

支撑三个 Maker-ACTION 分页选择器（扁平 Catalog/LC Index、Parent LC picker、IB/SG Index）。通过 `api.catalog()` 从服务端一次性获取一个较为宽裕的批次（`fetchSize`），并在客户端对调用方过滤后的结果按固定的 DISPLAY_PAGE_SIZE=5 进行分页，而不是对服务端原始响应做分页——因为总数必须反映真正合格/过滤后的数量。`status`/`requireIssueReleased` 默认为 'ACTIVE'/true（历史上硬编码的 Maker-ACTION 取值），但对于非 Maker-action 的调用方（例如只读查询）可被覆写。刻意未被 InquireEventsService.loadIndex() 复用，因为后者需要的是真正的服务端分页。

## 证据来源

- `catalog-picker.service.ts:1-145`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]

## 2026-08-26 更新——修复"⚠ No eligible records available"假阴性闪烁（reviewer-reported: "A3S/A7 先出现错误提示，再出现候选列表"）

每一个 Step-1/Step-2 选择器的这条警告文案，此前都可能在真正的候选列表渲染完成之前先"假阳性"地一闪而过。根因之一在本服务自身：`total` 在 `load()` 一开始就被立即重置为 0，并在整个 HTTP 往返（contracts 请求，随后是逐候选人的 snapshot 请求）期间维持为 0——任何在这段窗口内读取 `total === 0` 的调用方，都会得到一个"零个合格记录"的假信号。

修复：新增 `loading` 布尔字段（`catalog-picker.service.ts:57`，`load()` 开始时置 true，结束/失败时置回 false——`catalog-picker.service.ts:118,133,139`），效仿 `IndexPickerComponent` 自身早已存在、但此前从未真正接上的同名 `loading` input。`catalogPicker`/`parentPicker`/`ibIndexPicker` 三个选择器实例目前都已在各自的 `<app-index-picker>` 使用处接上这个字段。

这只解决了两个独立根因中的一个——另一个（hint-set 驱动函数自身的第三路异步请求，`DocumentArrivalHintsService`）不属于本服务范围，由调用方 `MakerPanelComponent` 自己新增的 `hintsPending` 计数器负责，见 [[MakerPanelComponent]] 的对应更新。

新增基于 `Subject` 的专门测试（`catalog-picker.service.spec.ts`）——此前的同步 `of(...)` 风格测试永远无法复现一个"仍在请求中"的窗口，因而永远无法捕捉这类竞态。

### 证据来源（本次更新）
- `catalog-picker.service.ts:54-57,105-139`（`loading` 字段定义与读写点）
