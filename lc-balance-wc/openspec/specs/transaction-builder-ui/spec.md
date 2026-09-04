# Transaction Builder UI 規格

## Purpose

定義 Angular Presentation 與輸入行為，但不轉移服務端的權威控制；涵蓋 Import／Export 分區、Function-driven Fields、Natural Key、Balance Preview 與精確 Amount 顯示。

## Requirements

### Requirement: Import 與 Export 分離

Transaction Builder、Maker Queue、Inquire Events 與 Delete Pending 導覽 SHALL 將 Import LC 與 Export Confirmed context 分開。

#### Scenario: 切換業務方向

- **WHEN** 使用者從 Import 切換至 Export Confirmed
- **THEN** Functions、natural-key labels、Tenor options 與 inquiry ledgers SHALL 反映所選方向

### Requirement: Function 驅動欄位

所選 function strategy SHALL 決定 visible、required 與 protected fields；API 仍為權威 validator。

#### Scenario: A4 Protected Amount

- **WHEN** A4 載入所選 A3 Arrival
- **THEN** Amount SHALL 從該 Arrival 帶入並顯示為 protected
- **AND** SHALL NOT 根據使用者輸入計算 typed-amount capacity warning

### Requirement: Natural Key 醒目顯示

Amendment Number、SG Number、IB／EB Number 等 transaction-specific natural-key fields SHALL 作為交易輸入的一部分，以一致且醒目的樣式呈現。

#### Scenario: A8 輸入

- **WHEN** 選取 LC 後開啟 A8
- **THEN** SG Number SHALL 顯示為醒目的必填交易輸入

### Requirement: Balance Preview 說明

UI SHALL 顯示 Confirmed、Available、Pending Earmark、Off-Balance Exposure 與 Tight Available，並 SHALL 在適用時分別標示 Pending Amendment Effect 與 Tolerance Before／After。

#### Scenario: Pending Amendment

- **WHEN** A2 或 B2 為 Pending
- **THEN** Current Balance SHALL 顯示 Amendment Reference、Balance Effect 與 Tolerance Transition，且不得暗示 Confirmed Balance 已經改變

### Requirement: Amount 顯示格式

純數字 Amount Input SHALL 顯示 grouping separators 並保持可精確解析的 value semantics；shorthand input 在解析前 SHALL 不分組，protected amounts SHALL 使用幣別感知顯示格式。

#### Scenario: 純數字輸入

- **WHEN** 使用者輸入 `1000000`
- **THEN** Angular SHALL 顯示為 `1,000,000`，且不經 binary floating point 轉換

## 來源追蹤

- `src/app/transaction-builder/`
- `src/app/shared/`
- `docs/obsidian-balance-kb-v3.2/03-Balance-Flows/`
