使用 **Docker 環境中的 SonarQube** 對 `lc-balance` folder 內的全部程式碼進行完整的 **SonarQube Code Quality Scan**。

掃描範圍應涵蓋所有相關程式碼與子專案，並重點檢查：

* Bugs
* Vulnerabilities
* Security Hotspots
* Code Smells
* Reliability
* Security
* Maintainability
* Duplication
* Complexity
* Technical Debt
* Test Coverage
* Quality Gate Status

掃描完成後，根據 **SonarQube 實際掃描結果**整理完整報告，包括各 Severity 的問題、主要 Findings、建議修正優先順序及整體 Quality Gate 結果。

將報告保存為：

`lc-balance/SonarQube-scan-report.md`

**要求：報告必須以 Docker 上 SonarQube 的實際掃描結果為依據，不得以人工 Code Review 或 SonarQube-style assessment 取代實際 SonarQube Scan。**
