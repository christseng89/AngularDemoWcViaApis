# LC Balance UI / Message Improvement Proposal

> 狀態：設計建議與 sample，尚未接入 production code。

## 目標

1. Maker、Checker、Inquiry、Queue 使用同一套 UI primitives。
2. Info、Warning、Error 訊息必須 user-friendly，回答「發生甚麼事、目前狀態、下一步怎麼做」。
3. 技術錯誤碼保留給 log/support，不直接作為主要使用者訊息。
4. 新功能透過共用 component、message mapping 與 SCSS variants 延伸，避免複製樣式。

## 建議優先順序

### P1 — Message standardization

- 建立 `UiMessage` model。
- 建立 `ApiErrorPresenter`，集中將 HTTP status/backend code 映射成使用者訊息。
- 建立 `FeedbackMessageComponent`，統一 icon、色彩、ARIA、Retry 與 support code。
- 先遷移 Maker Submit、Checker Search/Approve/Reject。

### P1 — Shared stylesheet primitives

- 將 `.tb-btn`、`.tb-field`、`.tb-section`、`.tb-error`、`.tb-hint` 移到只編譯一次的 global partial。
- Component stylesheet 只保留該 component 的 layout。
- 不在每個 standalone component 重複輸出相同 CSS。

### P2 — Transaction screen UX

- 選擇 Function 後，Maker 與 Checker 都立即存在。
- Checker 不依賴當前 Maker session，可獨立搜尋並處理 Pending transaction。
- Submit 後 focus/scroll 到 Checker heading，但 Checker 本身不能因 Maker state 消失。
- Loading、Empty、Not Found、Business Warning、System Error 使用不同語意。

### P2 — Remarks-only Fix Pending

- 對沒有其他可安全修改欄位的 Function 提供 optional Remarks。
- 透過 Function policy 明確限制為 `REMARKS_ONLY`，不得解鎖金額或交易識別欄位。
- Settlement／compound transaction 不得因修改 Remarks 重新計算 balance、accounting 或 sibling movement。
- 詳細規格見 [Remarks-only Fix Pending](remarks-only-fix-pending.md)。

### P2 — Accessibility

- Blocking error：`role="alert"`。
- Info、empty result、loading：`role="status"`、`aria-live="polite"`。
- Field validation：`aria-invalid`、`aria-describedby`。
- Submit/Approve/Reject 失敗後，保留輸入並把 focus 移到 message summary。

## 建議目錄（正式實作時）

```text
src/app/shared/feedback/
├─ ui-message.model.ts
├─ api-error-presenter.service.ts
└─ feedback-message.component.*

src/styles/
├─ _tokens.scss
├─ _buttons.scss
├─ _forms.scss
├─ _feedback.scss
├─ _sections.scss
└─ _tables.scss
```

## Sample

- [Message 標準](message-standard.md)
- [Remarks-only Fix Pending](remarks-only-fix-pending.md)
- [Angular model/component sample](samples/feedback-message.sample.ts)
- [Template sample](samples/feedback-message.sample.html)
- [SCSS sample](samples/_feedback-message.sample.scss)
- [Tabbed workspace HTML sample](samples/tabbed-workspace.sample.html)
- [Tabbed workspace SCSS sample](samples/_tabbed-workspace.sample.scss)
- [Standalone styled preview（可直接用瀏覽器開啟）](samples/tabbed-workspace.preview.html)

> `tabbed-workspace.sample.html` 是 Angular template，必須由 Angular build 才會套用 binding/SCSS。
> 若要直接查看互動與 stylesheet，請開啟 `tabbed-workspace.preview.html`。

## 導入原則

先新增共用 abstraction，再逐畫面遷移。每遷移一個畫面都應執行 unit tests、component tests、accessibility check 與 production build；不要一次取代所有既有 message/SCSS。
