# Web Component 整合規格

## Purpose

定義公開的 Balance Component Custom Element Contract 與 Host Integration 邊界。

## Requirements

### Requirement: 具版本的 Host Configuration

Custom Element SHALL 只接受支援的 Configuration Version 及已記載的 View、Theme 與 Design Token options。

#### Scenario: 不支援的 Version

- **WHEN** Host 提供不相容 Configuration Version
- **THEN** Contract Parser SHALL 拒絕，而非靜默套用部分設定

#### Scenario: 支援的 Version

- **WHEN** Host 提供受支援 Configuration Version 與已記載 options
- **THEN** Contract Parser SHALL 接受並產生完整 validated configuration

### Requirement: Theme 支援

Component SHALL 支援 System、Light、Dark themes 及已記載 CSS Design Tokens，且不得將 Host-specific styling 洩漏至 Domain Behavior。

#### Scenario: System Theme 變更

- **WHEN** Host 使用 System Theme 且 Operating System Preference 改變
- **THEN** 已渲染 Component SHALL 更新 effective theme

#### Scenario: Explicit Dark Theme

- **WHEN** Host 明確指定 Dark Theme
- **THEN** Component SHALL 使用 Dark tokens
- **AND** Operating System Preference SHALL NOT 覆寫 explicit host choice

### Requirement: Framework Adapters

Angular、React 與 Vue adapters SHALL 包裝同一個公開 Custom Element Contract，不得定義不同 Balance Behavior。

#### Scenario: 等價 Configuration

- **WHEN** 兩個受支援 adapters 收到等價 Host Configuration
- **THEN** SHALL 向 Balance Custom Element 傳遞等價 Configuration

#### Scenario: Adapter 不得覆寫 Domain Behavior

- **WHEN** Angular、React 或 Vue adapter 包裝相同 transaction interaction
- **THEN** adapter SHALL 只轉接公開 properties、events 與 lifecycle
- **AND** SHALL NOT 定義 framework-specific balance rules

### Requirement: Release 驗證

可發布 Web Component Release SHALL 包含已建置 bundle、styles、manifest、contract declarations 與 adapter artifacts，並 SHALL 通過 Release Verifier。

#### Scenario: 缺少 Artifact

- **WHEN** 缺少必要 Release Artifact
- **THEN** Release Verification SHALL 失敗

#### Scenario: Release Artifacts 完整

- **WHEN** bundle、styles、manifest、contract declarations 與全部 adapter artifacts 均存在且一致
- **THEN** Release Verifier SHALL 通過該 artifact set

## 來源追蹤

- `src/app/web-component/`
- `src/adapters/`
- `docs/web-component-contract.md`
- `docs/obsidian-balance-kb-v3.2/09-Architecture/Configuration Reference.md`
