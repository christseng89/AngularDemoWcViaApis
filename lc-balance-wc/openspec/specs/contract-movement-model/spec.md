# 合約與交易事件模型規格

## Purpose

定義所有 Balance Component 業務品種共用的持久化身分、事件帳本與狀態語意，確保 Natural Key、Event Seq、歷史 Snapshot、Voucher 與各類狀態均可追蹤且不互相混淆。

## Requirements

### Requirement: 邏輯合約身分

系統 SHALL 以 instrument type 及其配置的 natural key 識別邏輯合約；LC Number 必須永遠存在，並依 instrument 要求提供 IB Number 或 SG Number。

#### Scenario: 重複 natural key

- **WHEN** 建立請求重複使用現有 instrument natural key
- **THEN** 系統 SHALL 依 movement contract 解析既有邏輯合約或拒絕重複資料
- **AND** SHALL NOT 靜默建立第二筆相同身分的邏輯合約

#### Scenario: 不同 Secondary Reference

- **WHEN** 相同 LC Number 依 instrument 規則搭配不同 IB Number 或 SG Number
- **THEN** 系統 SHALL 依完整 configured natural key 解析其正確 logical contract identity

### Requirement: 事件帳本不可變性

系統 SHALL 將每筆接受的業務 movement 記錄成關聯邏輯合約的事件，並保存事件發生時的 snapshot 與 voucher 事實。

#### Scenario: 後續餘額變更

- **WHEN** 後續 movements 改變目前餘額或 Account Mapping
- **THEN** 先前事件已保存的 snapshot 與 voucher SHALL 維持歷史事實

#### Scenario: Movement 被 Reject 或 Delete

- **WHEN** 後續 workflow action Reject 或 Delete 一筆未完成 movement
- **THEN** 系統 SHALL 以狀態及 audit facts 表達結果
- **AND** SHALL NOT 重寫較早事件的 snapshot

### Requirement: Movement 冪等身分

系統 SHALL 使用合約 context 與 Event Seq 強制執行冪等，使相同請求重送時不能建立重複金融 movement。

#### Scenario: Event Seq 重複

- **WHEN** 使用相同冪等身分再次送出同一 movement 請求
- **THEN** 系統 SHALL 回傳既有結果或穩定的重複錯誤
- **AND** SHALL NOT 重複套用餘額效果

#### Scenario: 不同 Contract Context 使用相同 Event Seq

- **WHEN** 兩個不同 logical contract contexts 收到相同 Event Seq
- **THEN** 冪等判定 SHALL 包含 contract context
- **AND** SHALL NOT 將其中一個 contract 的 movement 誤認為另一個

### Requirement: 狀態分離

系統 SHALL 將合約 lifecycle status、movement workflow status、accounting payload status 與 audit history 維持為不同概念。

#### Scenario: ACTIVE 合約上的 pending movement

- **WHEN** Maker 對 ACTIVE 合約送出 movement
- **THEN** movement MAY 為 PENDING，而合約仍維持 ACTIVE

#### Scenario: Workflow 完成不等於外部入帳完成

- **WHEN** movement workflow status 成為 APPROVED
- **THEN** accounting payload status 與 external posting evidence SHALL 仍按各自事實保存
- **AND** SHALL NOT 由 APPROVED 自動推定外部 ledger 已完成

## 來源追蹤

- `microservices/balance-component/src/types.ts`
- `microservices/balance-component/src/db/schema.ts`
- `microservices/balance-component/src/store/`
- `docs/obsidian-balance-kb-v3.2/08-Data-Model/`
