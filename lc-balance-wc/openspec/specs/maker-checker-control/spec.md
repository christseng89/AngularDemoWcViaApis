# Maker／Checker 控制規格

## Purpose

定義四眼控制、Pending 修正與核准行為，確保 Maker／Checker 身分分離、完成前重新驗證、Compound Movement 原子處理以及 Fix／Delete Pending 全程留存審計證據。

## Requirements

### Requirement: Maker 與 Checker 分離

Checker 身分與 Maker 相同時，服務 SHALL 拒絕 Release、Reject 或 Acknowledge。

#### Scenario: 相同操作人嘗試 Release

- **WHEN** `maker1` 嘗試 Release 由 `maker1` 建立的 movement
- **THEN** API SHALL 拒絕該動作
- **AND** movement SHALL 維持 pending

#### Scenario: 相同操作人嘗試 Acknowledge

- **WHEN** `maker1` 嘗試 Acknowledge 由 `maker1` 建立的 A3／A3S movement
- **THEN** API SHALL 拒絕該動作
- **AND** movement SHALL 維持未完成狀態

### Requirement: 服務端權威重新驗證

Checker 完成交易前，服務 SHALL 重新讀取目前 movement、contract 與相依餘額，並重新驗證 eligibility。

#### Scenario: Maker Submit 後 capacity 改變

- **WHEN** Maker Submit 與 Checker Release 之間的相依資料發生變化
- **THEN** Release SHALL 使用最新已提交狀態
- **AND** movement 已不符合資格時 SHALL 原子失敗

#### Scenario: Release 時仍符合資格

- **WHEN** 不同 Checker Release 且重新讀取的 movement、contract 與相依餘額仍符合資格
- **THEN** 服務 SHALL 以最新已提交狀態完成該動作

### Requirement: 複合交易原子完成

完成多個關聯 legs 的 Checker 動作 SHALL 在單一 transaction 提交全部狀態、餘額及 audit 修改，否則全部回滾。

#### Scenario: 任一複合 leg 失敗

- **WHEN** 任一關聯 leg 無法完成
- **THEN** 所有 legs SHALL NOT 發生部分 Release

#### Scenario: 所有複合 legs 成功

- **WHEN** 每個關聯 leg、side effect 與 audit write 均成功
- **THEN** 全部狀態與餘額修改 SHALL 在同一 transaction 提交

### Requirement: Fix Pending 限制

Fix Pending SHALL 只修改 function policy 允許的欄位，並保存鎖定的身分、reference、currency、monetary 與 linked-movement 欄位。

#### Scenario: 修正 remarks

- **WHEN** Maker 編輯允許修正的說明並保存 pending movement
- **THEN** 允許的欄位 SHALL 更新
- **AND** protected 欄位 SHALL 維持不變

#### Scenario: 嘗試修正 Protected 欄位

- **WHEN** Fix Pending request 嘗試改變鎖定的 identity、reference、currency、monetary 或 linked-movement 欄位
- **THEN** 服務 SHALL 拒絕該修改
- **AND** 原 pending movement SHALL 維持不變

### Requirement: Delete Pending 審計

Delete Pending SHALL 只適用於未完成 movements，並 SHALL 追加 deletion audit record。

#### Scenario: 刪除已核准 movement

- **WHEN** 呼叫端嘗試刪除已完成 movement
- **THEN** 服務 SHALL 拒絕該請求

#### Scenario: 刪除未完成 movement

- **WHEN** Maker 刪除符合資格的未完成 movement
- **THEN** movement SHALL 不再影響目前 pending balance
- **AND** 系統 SHALL 追加可追蹤 deletion audit record

## 來源追蹤

- `microservices/balance-component/src/domain/statusTransition.ts`
- `microservices/balance-component/src/service/movementReleasePolicyService.ts`
- `microservices/balance-component/src/service/unitOfWork.ts`
- `docs/obsidian-balance-kb-v3.2/06-Maker-Checker/Maker Checker Lifecycle.md`
