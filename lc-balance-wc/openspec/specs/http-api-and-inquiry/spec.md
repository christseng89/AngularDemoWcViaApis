# HTTP API 與查詢規格

## Purpose

定義可觀察的 Balance HTTP Commands、Queries、錯誤處理與查詢行為，確保 OAS 契約、Compound Atomicity、Eligibility 提示、事件查詢及 Empty State 具有一致語意。

## Requirements

### Requirement: 符合 OAS 的 HTTP Contract

Balance Component HTTP API SHALL 只提供目前 OpenAPI contract 記載的 request／response shapes，並 SHALL 對被拒絕的業務動作回傳穩定 structured errors。

#### Scenario: 無效 Request

- **WHEN** 呼叫端 Submit 無效 movement payload
- **THEN** API SHALL 回傳已記載的 non-success status 與 structured error body
- **AND** SHALL NOT 洩漏 SQL、stack trace 或內部 filesystem path

### Requirement: Compound Commands 原子性

Compound creation、release 與 mixed action endpoints SHALL 原子執行整組 commands。

#### Scenario: 第二個 Action 無效

- **WHEN** Compound Request 的第二個 Action 驗證失敗
- **THEN** 第一個 Action SHALL NOT 保持已提交

### Requirement: Eligibility Query 僅供提示

Catalog、close-eligible 與 reopen-eligible endpoints SHALL 協助 UI 選取候選資料，但 SHALL NOT 取代 command-time 服務端驗證。

#### Scenario: Catalog Result 已過時

- **WHEN** 所選 contract 在 query 後變得不合資格
- **THEN** 後續 command SHALL 依目前狀態被拒絕

### Requirement: 查詢包含關聯 Ledgers

Inquire Events SHALL 回傳 root contract 的相關 child-ledger events，包括 A3S 與 memo-only B3 events，並依 event date／time 排序。

#### Scenario: 含 A3S 的 Import LC

- **WHEN** 使用者查詢包含 A3S business event 的 Import LC
- **THEN** Event History SHALL 可找到相關 LC 與 Shipping Guarantee legs

### Requirement: Empty State 與錯誤分離

Angular Inquiry、Maker Queue 與 Delete Pending views SHALL 區分成功空結果與 transport／server failure。

#### Scenario: 無記錄

- **WHEN** API 成功但沒有符合記錄
- **THEN** UI SHALL 顯示一致的非錯誤 Empty-State Panel

#### Scenario: 服務不可用

- **WHEN** 無法連線 upstream service
- **THEN** UI SHALL 顯示可採取行動的錯誤，並 SHALL NOT 顯示成「No records」

## 來源追蹤

- `analysis/balance-component-api.yaml`
- `microservices/balance-component/src/routes/`
- `src/app/transaction-builder/balance-component-api.service.ts`
- `docs/obsidian-balance-kb-v3.2/07-API/API Reference.md`
