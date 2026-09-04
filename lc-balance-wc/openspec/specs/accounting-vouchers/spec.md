# 帳務與 Voucher 規格

## Purpose

定義持久化 internal vouchers 及其與 downstream Accounting 的邊界。

## Requirements

### Requirement: 借貸平衡 Voucher

Balance Component 產生的每筆非零 contingent voucher SHALL 以 movement currency 保存相等的 Debit 與 Credit 金額。

#### Scenario: Issue Voucher

- **WHEN** A1 或 B1 movement 以正數 ceiling amount 建立
- **THEN** 已保存 contingent voucher SHALL 包含借貸平衡的 establishment pair

#### Scenario: 非零 Voucher 借貸不平衡

- **WHEN** 推導出的 contingent voucher Debit 與 Credit totals 不相等
- **THEN** movement SHALL NOT 以該 voucher 完成持久化

### Requirement: 方向沖銷

Decrease、Utilize、Settlement、Redemption、Close 與 Expire vouchers SHALL 對調其對應 establishment family 的 Debit／Credit 方向。

#### Scenario: Amendment Decrease

- **WHEN** 建立 monetary decrease voucher
- **THEN** 其 account sides SHALL 與對應 Increase 方向相反

#### Scenario: Amendment Increase

- **WHEN** 建立 monetary increase voucher
- **THEN** 其 account sides SHALL 使用對應 establishment family 的原方向

### Requirement: Voucher Snapshot

系統 SHALL 在 movement 建立時推導並保存 internal voucher，且 SHALL 顯示該 snapshot，不得以目前 mappings 重新計算。

#### Scenario: Account Mapping 後續變更

- **WHEN** 先前 movement 建立後 Account Maintenance 發生變更
- **THEN** 先前 movement SHALL 繼續顯示已保存 account identity 與 mapping version

#### Scenario: Configuration Reload 後查詢歷史 Voucher

- **WHEN** Reload 以 defaults 覆寫目前 Account Mappings
- **THEN** 已存在 voucher snapshot SHALL NOT 被重新解析或改寫

### Requirement: Earmarked Memo 可見性

即使不需 downstream posting 或 reversal，EARMARKING／EARMARKED internal memo vouchers 仍 SHALL 保持可見。

#### Scenario: B3 Internal Memo

- **WHEN** B3 已 Submit
- **THEN** 其 Export Bills examination memo Debit／Credit pair SHALL 可供審查
- **AND** downstream `accountEntries` SHALL 保持 null

#### Scenario: A3 Internal Memo

- **WHEN** A3 已 Submit 或 Acknowledge
- **THEN** 其 LC UTILIZE memo entries SHALL 保持可見
- **AND** memo visibility SHALL NOT 要求 downstream posting payload

### Requirement: Downstream 邊界

Balance Component SHALL 區分服務端推導的 contingent voucher 與呼叫端提供的 downstream `accountEntries`；缺少外部 acknowledgement contract 時 SHALL NOT 宣稱外部帳務已完成。

#### Scenario: Internal Voucher 已核准

- **WHEN** movement 成為 APPROVED
- **THEN** 該狀態 SHALL 只證明 Balance Component workflow 完成
- **AND** SHALL NOT 單獨證明 external ledger posting

#### Scenario: 呼叫端提供 Downstream Entries

- **WHEN** API request 包含允許的 downstream `accountEntries`
- **THEN** 系統 SHALL 將其與服務端推導的 contingent voucher 分開保存及呈現
- **AND** SHALL NOT 以呼叫端 payload 覆寫 internal voucher facts

## 來源追蹤

- `microservices/balance-component/src/domain/contingentAccountEntry.ts`
- `microservices/balance-component/src/service/balanceService.ts`
- `docs/obsidian-balance-kb-v3.2/04-Exposure-Accounting/Transaction Accounting Matrix.md`
