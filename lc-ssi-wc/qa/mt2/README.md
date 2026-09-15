# QA current artifacts

This directory contains only the current controlled QA/UAT artifacts and the
fixtures required to reproduce them. Superseded drafts and historical reports
are retained outside the Git repository under:

`D:\Baseline_V6_20251231\qa-archived\mt2`

## Current UAT workbook

- [`uat/MT2xx_SSI_Resolution_UAT執行清單_v15.2_DRAFT_R10.xlsx`](uat/MT2xx_SSI_Resolution_UAT執行清單_v15.2_DRAFT_R10.xlsx)
- [`uat/MT2xx_SSI_Resolution_UAT執行清單_v15.2_DRAFT_R10.xlsx.sha256.txt`](uat/MT2xx_SSI_Resolution_UAT執行清單_v15.2_DRAFT_R10.xlsx.sha256.txt)

## Current test definition workbooks

- [`tdd/MT2XX_支援標準SSI_SR2026_MRG與ISO20022對應覆核版_v15.1.xlsx`](tdd/MT2XX_支援標準SSI_SR2026_MRG與ISO20022對應覆核版_v15.1.xlsx)
- [`tdd/MT2XX_測試案例_SSI與NOSTRO_v6.xlsx`](tdd/MT2XX_測試案例_SSI與NOSTRO_v6.xlsx)
- [`mt2-final/fixtures/MT2XX_測試案例_SSI與NOSTRO_v6.2_FINAL.xlsx`](mt2-final/fixtures/MT2XX_測試案例_SSI與NOSTRO_v6.2_FINAL.xlsx)

## Current execution evidence

- [`mt2-final/evidence/final/mt2-final-qa-report.json`](mt2-final/evidence/final/mt2-final-qa-report.json)
- [`reports/MT2_139_UI全量測試報告_ZH.md`](reports/MT2_139_UI全量測試報告_ZH.md)
- [`reports/mt2-139-ui-results.json`](reports/mt2-139-ui-results.json)
- [`reports/MT2XX_v15.3_api_UAT_20260912.json`](reports/MT2XX_v15.3_api_UAT_20260912.json)
- [`reports/MT2XX_v15.3_browser_UAT_20260912.json`](reports/MT2XX_v15.3_browser_UAT_20260912.json)
- [`reports/MT2XX_v15.3_browser_DATA_QUALITY_409_20260912.json`](reports/MT2XX_v15.3_browser_DATA_QUALITY_409_20260912.json)
- [`reports/MT2XX_v15.3_browser_DATA_QUALITY_500_20260912.json`](reports/MT2XX_v15.3_browser_DATA_QUALITY_500_20260912.json)
- [`reports/claude-independent-20260912/TEST-REPORT-v2.md`](reports/claude-independent-20260912/TEST-REPORT-v2.md)
- [`reports/BA-MRG-MT202-53A-RULING-20260912.md`](reports/BA-MRG-MT202-53A-RULING-20260912.md)
- [`reports/BA-DQ-NOSTRO-CONFIRMATION-20260912.md`](reports/BA-DQ-NOSTRO-CONFIRMATION-20260912.md)

The independent report is supplementary review evidence. Its K1-K8 findings
are not automatically closed by the current automated gate; P1 requires a BA
decision on the MT202 field 53a rule before K4/K5 can be accepted or rejected.

The latest detailed browser evidence is retained in
`reports/mt2-139-ui-evidence/2026-09-12T05-02-44-194Z`.

## Retention rule

- Keep the current controlled artifact and its checksum in `qa`.
- Keep fixtures and baselines referenced by the current automated gate.
- Move superseded drafts, prior executions, and historical reports to the
  external `qa-archived` directory.
- Do not create `qa-archived` inside this Git repository.
