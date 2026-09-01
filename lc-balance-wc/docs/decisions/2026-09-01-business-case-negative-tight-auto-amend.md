# 2026-09-01 Business Case 負 Tight 自動修復與 Cleanup 清場

## 決策

Business Case Runner 在任一步成功回覆中發現 Tight Available Balance 小於 0 時，必須先修復再繼續。Import 建立並釋放 A02 `AMEND_INCREASE`；Export 建立並釋放 B02 `AMEND`，金額為負值的絕對值，之後重新讀取 snapshot 確認非負。

Cleanup Database 成功後，UI 必須清除單一案例結果、Run All 結果卡及既有錯誤。失敗時保留既有結果，方便診斷。

## 理由

測試資料不得留下銀行不允許的負 Tight LC Balance。修復沿用正式 create／release／snapshot API，因此與實際 Maker／Checker 規則一致且留下完整 trace。

## 影響

- Runner trace 會額外顯示自動 A02／B02 的 create、release 與驗證 snapshot。
- 不新增 Microservice 或 Channel API endpoint/schema。
- A6 的複合 Checker action 先釋放來源 A3/A3S、再釋放 Acceptance；release-time 驗證接受來源剛在同一原子動作內轉為 RELEASED。
- Import Case 2／7／8／9／12 的 Usance 流程必須使用 acknowledge + linked Acceptance，不得繞過 A6。

## 依據

- `backend/server.js`
- `backend/data/businessCases.js`
- `backend/test/runCase.test.js`
- `src/app/business-case-runner/business-case-runner.component.spec.ts`
- `microservices/balance-component/test/unit/service/movementReleasePolicyService.test.ts`
