# Transaction Index API 權威驗證

日期：2026-09-01  
狀態：Accepted

## 決策

Transaction Index 是 UI 候選清單，不是安全或業務規則邊界。A2–A11／B2–B7 的 API 在建立 movement 時重新解析 contract、parent 與 referenced transaction，並驗證當下狀態；Checker Release 在核准前再次驗證。

A6 只接受同 LC、已 acknowledged、仍 PENDING 且未 Maker Submit 的 A3／A3S UTILIZE。B4 只接受同 Confirmation、已 RELEASED、未消耗且未被其他 pending B4 佔用的 B3 Present Docs。

## 理由

UI 清單載入後資料可能被其他請求改變，直接 API caller 也可能完全繞過 UI。Submit 與 Release 共用相同 domain eligibility，可避免 stale selection、錯誤狀態與重複消耗。

## 驗證

兩份 Balance microservice 均通過 39 suites／791 tests，branch coverage 95.06%。OAS 與 Obsidian Transaction Index 契約同步記錄此規則。
