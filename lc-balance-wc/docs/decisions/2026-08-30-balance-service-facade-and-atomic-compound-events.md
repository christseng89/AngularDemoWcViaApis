# BalanceService façade與原子 Compound Event

- 狀態：已確認
- 日期：2026-08-30
- 確認者：Architecture／Reviewer
- 影響範圍：Service／API／UI／Testing

## 背景

原本的 `balanceService.ts` 同時承擔 validation、query、snapshot、contract lifecycle 與 release side effects，難以維護；A3S、A6、B4、B5 又需要多腿交易的一致性。

## 決策

`BalanceService` 保留為 routes 的 compatibility façade與 SQLite transaction coordinator。單一職責由 focused collaborators 實作；多腿 business event 一律使用既有 `/balance-movements/compound*` 原子操作。

## 理由

保持 OCP／SRP，同時避免重構改變公開 API、錯誤順序、資料庫語意或 Maker／Checker lifecycle。原子 compound command 可避免部分成功後留下不一致 exposure。

## 影響

- routes 與 response schema 不變。
- Channel adapter 不得重新拆成非原子的逐腿 HTTP calls。
- 新規則優先加入 registry／policy 或最小的 collaborator。
- OAS v1.37.0／Channel v1.8.0 記錄此架構與相容性邊界。

## 依據

- `microservices/balance-component/src/service/README.md`
- `microservices/balance-component/src/service/balanceService.ts`
- `analysis/balance-component-api.yaml`
- `microservices/balance-component/test/unit/service/`
