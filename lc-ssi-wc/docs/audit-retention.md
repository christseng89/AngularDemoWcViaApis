# Audit Log 線上、封存與清除政策

SSI 服務對四張受治理 audit table 套用同一個 lifecycle policy：`audit_event`、`rma_audit_event`、`nostro_audit_event`、`booking_branch_entity_audit`。

- `AUDIT_ONLINE_QUERY_DAYS=7`：一般線上稽核查詢只顯示最近七天。
- `AUDIT_ARCHIVE_AFTER_DAYS=14`：事件滿十四天後移入 `audit_event_archive`；可改為 `30`（一個月口徑）。
- `AUDIT_ARCHIVE_RETENTION_DAYS=365`：事件封存後保留一年；可改為 `180`（六個月口徑）。
- `AUDIT_RETENTION_SCHEDULE_HOURS=12`：每十二小時執行一次 lifecycle；可改為 `24`。允許範圍為 1–168 小時。
- 四個值必須是無空白、無小數且大於零的十進位整數；三個期限須嚴格符合 `onlineQueryDays < archiveAfterDays < archiveRetentionDays`，schedule 不得超過 168 小時。缺值、錯值、順序錯誤或不安全週期會使服務啟動失敗。
- 服務啟動時執行一次 lifecycle，之後每六小時執行；不在業務 API request path 執行。
- 所有 cutoff 以 UTC 計算。僅處理 `timestamp < cutoff`；恰好等於 cutoff 或較新的紀錄保留。
- 四張來源表的封存與來源刪除在同一個 `BEGIN IMMEDIATE` transaction 內完成。每筆先保存完整 JSON payload 與 SHA-256，讀回驗證成功後才刪除來源；任一步失敗即 rollback。
- 封存清除以 `archived_at` 計算，避免剛補封存的舊事件立刻被刪除。
- cutoff 使用 parameter binding；table name 僅可來自程式內固定 allow-list。
- `GET /api/health/audit-retention` 回傳三個期限、三個 UTC cutoff、上次／下次執行時間、逐表封存數及 archive purge 數，作為運行證據。

本政策是 lifecycle-window append-only：事件不可更新；超過線上查詢期後不再出現在一般畫面，達封存門檻後移入不可變 archive，最後才依 archive retention 永久清除。Archive 讀取 API 必須另行完成授權與資料遮罩設計，不得由 health endpoint 洩露事件 payload。
