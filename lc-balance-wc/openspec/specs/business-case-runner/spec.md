# Business Case Runner 規格

## Purpose

定義端到端 Lifecycle Cases 的開發與驗收編排，涵蓋服務就緒、完整案例執行、手動測試前置資料保留及資料清理邊界，確保測試結果可診斷且不破壞維護設定。

## Requirements

### Requirement: 服務就緒狀態

Business Case Runner SHALL 只在 Backend 與 Balance Microservice dependencies 可連線時載入 cases；dependency failure 時 SHALL 回報錯誤且不得啟用不安全操作。

#### Scenario: Balance Microservice 不可用

- **WHEN** Backend 無法連線 Balance API
- **THEN** Runner SHALL 顯示可採取行動的 failure state
- **AND** 需要服務就緒的 Run All 與 Cleanup controls SHALL 保持不可用

#### Scenario: Dependencies 全部就緒

- **WHEN** Backend 與 Balance Microservice health checks 均成功
- **THEN** Runner SHALL 載入已登記 cases
- **AND** Run All 與 Cleanup controls SHALL 依正常操作狀態啟用

### Requirement: 完整 Lifecycle Cases

Runner SHALL 對真實 Balance Microservice 執行已登記 Import／Export cases，並 SHALL 驗證預期成功及拒絕結果。

#### Scenario: Run All

- **WHEN** 所有 dependencies 已就緒且選擇 Run All
- **THEN** 每個已登記 case SHALL 按 deterministic orchestration order 執行
- **AND** 每項失敗 SHALL 識別 case 與失敗步驟

#### Scenario: Case 驗證預期拒絕

- **WHEN** 已登記 case 的某一步預期 API 拒絕
- **THEN** 收到符合預期的拒絕 SHALL 記為該步通過
- **AND** 不同 status、code 或非預期成功 SHALL 記為可診斷失敗

### Requirement: 保留手動測試前置資料

Run All SHALL 為每條已記載的手動 A4、A6、B4 測試路徑各保留一筆合資格 prerequisite。

#### Scenario: Run All 完成

- **WHEN** 完整 suite 成功
- **THEN** 手動 transaction pickers SHALL 具有預期的合資格 seed records

#### Scenario: 每條手動路徑各自保留

- **WHEN** Suite 執行會消耗 A4、A6 或 B4 的一般 prerequisite
- **THEN** Runner SHALL 為三條記載的手動路徑各保留一筆獨立且符合資格的 record

### Requirement: Transaction Cleanup 邊界

Cleanup Database SHALL 移除測試交易資料，同時保留 Account Number Mappings。

#### Scenario: Cleanup 後 Reload

- **WHEN** Cleanup 成功
- **THEN** Services SHALL 保持就緒
- **AND** 已維護 Account Number Mappings SHALL 仍可使用

#### Scenario: Cleanup 不等於 Configuration Reload

- **WHEN** Account Mapping 已由使用者修改後執行 Cleanup
- **THEN** Cleanup SHALL NOT 以 configuration defaults 覆寫該 mapping

## 來源追蹤

- `backend/data/businessCases.js`
- `backend/server.js`
- `src/app/business-case-runner/`
- `docs/obsidian-balance-kb-v3.2/10-Test-Scenarios/Test Coverage and Business Cases.md`
