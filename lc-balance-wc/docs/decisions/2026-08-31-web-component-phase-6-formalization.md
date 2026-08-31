# Decision: Web Component documentation authority and governance

- **Date:** 2026-08-31
- **Status:** Accepted

## Decision

根目錄 `README.md`是 onboarding入口，`docs/web-component.md`是導覽；contract、framework、styling、
governance、operations及migration各有唯一主題文件。Phase plans保留歷史，不具有現行規範優先權。

Package與 contract採分離版本治理；registry publish必須由 release owner核准。WC不新增認證介面，
伺服器持續作為授權、驗證與 Balance狀態權威。

## Consequences

文件變更成為 release gate；links、OAS YAML、exports、manifest、pack及 smoke tests必須一致。HTTP
contract無差異時不得為了文件階段改寫 OAS，而以 no-change record留下審查證據。
