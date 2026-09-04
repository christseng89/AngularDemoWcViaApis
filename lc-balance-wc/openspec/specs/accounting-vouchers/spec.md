# 帳務與 Voucher 規格

## Purpose

定義持久化 internal vouchers 及其與 downstream Accounting 的邊界。

## Requirements

### Requirement: 借貸平衡 Voucher

Balance Component 產生的每筆非零 contingent voucher SHALL 以 movement currency 保存相等的 Debit 與 Credit 金額。

#### Scenario: Issue Voucher

- **WHEN** A1 或 B1 movement 以正數 ceiling amount 建立
- **THEN** 已保存 contingent voucher SHALL 包含借貸平衡的 establishment pair

### Requirement: 方向沖銷

Decrease、Utilize、Settlement、Redemption、Close 與 Expire vouchers SHALL 對調其對應 establishment family 的 Debit／Credit 方向。

#### Scenario: Amendment Decrease

- **WHEN** 建立 monetary decrease voucher
- **THEN** 其 account sides SHALL 與對應 Increase 方向相反

### Requirement: Voucher Snapshot

系統 SHALL 在 movement 建立時推導並保存 internal voucher，且 SHALL 顯示該 snapshot，不得以目前 mappings 重新計算。

#### Scenario: Account Mapping 後續變更

- **WHEN** 先前 movement 建立後 Account Maintenance 發生變更
- **THEN** 先前 movement SHALL 繼續顯示已保存 account identity 與 mapping version

### Requirement: Earmarked Memo 可見性

即使不需 downstream posting 或 reversal，EARMARKING／EARMARKED internal memo vouchers 仍 SHALL 保持可見。

#### Scenario: B3 Internal Memo

- **WHEN** B3 已 Submit
- **THEN** 其 Export Bills examination memo Debit／Credit pair SHALL 可供審查
- **AND** downstream `accountEntries` SHALL 保持 null

### Requirement: Downstream 邊界

Balance Component SHALL 區分服務端推導的 contingent voucher 與呼叫端提供的 downstream `accountEntries`；缺少外部 acknowledgement contract 時 SHALL NOT 宣稱外部帳務已完成。

#### Scenario: Internal Voucher 已核准

- **WHEN** movement 成為 APPROVED
- **THEN** 該狀態 SHALL 只證明 Balance Component workflow 完成
- **AND** SHALL NOT 單獨證明 external ledger posting

## 來源追蹤

- `microservices/balance-component/src/domain/contingentAccountEntry.ts`
- `microservices/balance-component/src/service/balanceService.ts`
- `docs/obsidian-balance-kb-v3.2/04-Exposure-Accounting/Transaction Accounting Matrix.md`
