# 版本、相容性與維護政策

## Version 1 相容性

新增 optional config、optional event detail、CSS token或 package subpath可以 backward-compatible
方式交付。移除／重新命名 event、方法、error code、view、token，或改變 Promise semantics屬於
breaking change，必須提高 contract major version並提供 migration guide。

Package SemVer 與 contract version分開管理：patch修錯且不改契約；minor增加相容能力；major可含
breaking contract，但仍須明示新 contract version。

## 棄用與 ownership

棄用項目至少保留一個 minor release cycle，文件必須列出替代方案、最早移除版本與 owner。

- WC shell／contract／adapters：Balance Component frontend maintainers。
- Balance rules與 HTTP schemas：既有 domain／service owners。
- CDN、reverse proxy與 rollback：部署平台 owner。
- 發布核准：release owner；自動化不得自行 publish。

每次變更需更新 contract tests、framework fixtures、Playwright、manifest／pack verification及文件。
若 OAS 無變化，仍需留下 no-change review record。

## Browser 與 accessibility

支援組織維護的 Chromium、Edge、Firefox、Safari最新兩個 major versions；需要 Custom Elements、
Shadow DOM、CSS custom properties、ES modules與 dynamic import。IE不支援。

目標為 WCAG 2.2 AA：鍵盤操作、可見 focus、語意 label、錯誤文字、對比與縮放。正式發布前應在
支援瀏覽器執行自動與人工 smoke；Shadow DOM不構成跳過 accessibility檢查的理由。

## Security boundary

目前 WC不擁有認證。不得新增 token／credential attribute、把 secret寫入 config、event、URL、
localStorage或文件範例。宿主與既有 transport環境負責 session／header；伺服器永遠是授權、驗證與
Balance狀態的權威來源。WC輸入不可取代服務端驗證。
