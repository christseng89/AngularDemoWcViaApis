# MT2 Release QA Gate 結果

## 結論

**尚未完成驗收，不得進入 UAT。**

正式 release chain 先執行既有 139 案真實瀏覽器測試；139 案雖不中斷完成，但只有 51 案通過、88 案失敗，因此 gate 在第一階段停止。之後的全量隨機矩陣是為了保存產品缺陷證據而獨立執行，不視為通過 release chain。

## 執行結果

- 139 deterministic browser：51/139 PASS、88 FAIL。API expected status/body 驗證已通過的失敗案例，畫面未顯示應有 error code；另有一項 Bank Service journey global check 失敗。
- Resolver exhaustive random browser：seed `MT2-RESOLVER-20260911`，5 個 resolver Bank Service、7 個 ACTIVE SSI currency pair、8 個 message/scenario journey，共 121/121 執行。
- 正向 pair matrix：56/56 PASS。
- USD→其他 ACTIVE SSI 幣別 metamorphic：16/16 PASS。
- 無 ACTIVE SSI 的有效幣別：0/40；全部錯誤回傳 HTTP 200 `RESOLVED`，未 fail-closed。
- 缺少 currency：0/8；全部錯誤回傳 HTTP 200，未拒絕缺欄位。
- 延遲 response race：FAIL。BARCGB22/USD 的舊 response 在切換 SGD 後重新填入右側結果；SGD 的真實 UI payload 雖正確送出 `currency=SGD`，服務仍回 HTTP 200 `RESOLVED`，不是 422 `SSI_NOT_FOUND`。

## 驗證與證據

- 真實 UI payload 含 `counterpartyBankServiceId`，不含 raw `counterpartyBic`、`intermediaryBic`、`accountWithBic`、`receiverCorrespondentBic`。
- Random runner 未改寫 request body；race 測試只延遲既有 request，再以原始內容送出。
- Prettier、ESLint、Node syntax、專案 lint、8/8 typecheck 與 QA runner unit tests 7/7 通過。
- Dependency audit 未通過：19 個既存弱點（10 high、9 moderate）；未執行 breaking `npm audit fix --force`。
- 詳細結果：`qa/mt2/reports/mt2-release-qa-run.json`、`qa/mt2/reports/mt2-139-ui-results.json`、`qa/mt2/reports/mt2-resolver-exhaustive-random.json`。
