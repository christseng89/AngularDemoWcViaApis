# B5 單筆結算與 Business Case 樣本下限

- 狀態：已確認
- 日期：2026-09-01
- 確認者：Reviewer／BA
- 影響範圍：Domain／API／UI／Test Data／Documentation

## 背景

B5 曾把 Acceptance Settlement 與 Reimbursement Receivable 綁成複合交易，
造成提交前必須查找配對 Receivable。Business Case Runner 也必須保留足夠的
A3S、A6、A7、B4、B5 資料供查詢及手工測試。

## 決策

B5 只建立及 Release 所選 `EPLC_ACCEPTANCE` 的 Settlement，不查找或處理
`EPLC_ACCEPTANCE_REIMB_RECEIVABLE`。A5 不在現行功能清單。

Run All Cases 沿用既有案例，並以六個尾端 readiness cases 分別為 A3S、A4、A6、A7、B4、B5
建立一個母 LC／Confirmation；每個母契約下保留三筆符合該功能 Index eligibility 的子交易。
這不是建立三個不同 LC：secondary references 分別為 G01–G03、B01–B03、IB0001–IB0003 或 E01–E03。

## 影響

- B5 使用單筆 Maker Submit、Checker Release、Reject 及 Delete Pending。
- Channel OAS 的 B5 `compoundLegs` 為空。
- Business Case registry 不建立 `REIMBURSE` movement。
- Registry 測試鎖定上述六類 readiness case 的單一母契約、三筆子交易、natural key、狀態及未被下游消耗條件。

## 依據

- `src/app/transaction-builder/function-strategy.ts`
- `backend/data/businessCases.js`
- `backend/test/businessCases.test.js`
- `analysis/balance-component-api.yaml`
- `analysis/balance-component-channel-api.yaml`
