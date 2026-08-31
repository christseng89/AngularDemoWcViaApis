# Balance Component Web Component Phase 6

Phase 6正式化文件 authority與治理：根 README提供 quick start，整合導覽連至 contract、framework、
styling、governance、operations、release及migration單一主題文件。

安全邊界維持不變：WC不處理認證、不接受 token attributes，server持續作為授權、驗證及 Balance
狀態權威。2026-08-31比對實作與兩份 OAS後確認 Phase 1–6無 HTTP contract change；OAS內容不改。

Release evidence包含 Markdown link validation、OAS YAML parsing、Jest、Playwright、typechecks、build、
manifest、bundle inspection、pack dry-run及 tarball consumer smoke。自動化不得 publish。
