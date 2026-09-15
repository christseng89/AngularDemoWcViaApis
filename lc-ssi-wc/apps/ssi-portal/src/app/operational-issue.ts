export interface OperationalIssue {
  readonly code: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly reason: string;
  readonly impact: string;
  readonly retryLabel: string;
}

const OPERATIONAL_ISSUES: Readonly<Record<string, OperationalIssue>> = {
  AUDIT_SERVICE_UNAVAILABLE: {
    code: "AUDIT_SERVICE_UNAVAILABLE",
    eyebrow: "EVIDENCE LEDGER",
    title: "稽核事件暫時無法載入",
    reason: "系統未能讀取 append-only audit evidence。",
    impact: "僅影響稽核查詢；不會變更 SSI 或刪除既有證據。",
    retryLabel: "重試稽核資料",
  },
  BANK_SERVICE_UNAVAILABLE: {
    code: "BANK_SERVICE_UNAVAILABLE",
    eyebrow: "BANK DIRECTORY",
    title: "銀行目錄服務暫時無法使用",
    reason: "系統目前無法以 Bank Service ID 取得受控 BIC。",
    impact: "銀行選擇與 Resolution Preview 暫停；Message Index 仍可獨立瀏覽。",
    retryLabel: "重試銀行目錄",
  },
  PAYMENT_MESSAGE_INDEX_UNAVAILABLE: {
    code: "PAYMENT_MESSAGE_INDEX_UNAVAILABLE",
    eyebrow: "MESSAGE CATALOGUE",
    title: "Payment Message Index 暫時無法載入",
    reason: "系統未能從參數服務取得 Counterparty SSI 訊息清單。",
    impact: "Message 與 Scenario 選取暫停；已載入的銀行目錄不受影響。",
    retryLabel: "重試 Message Index",
  },
};

export function presentOperationalIssue(code: string): OperationalIssue {
  return (
    OPERATIONAL_ISSUES[code] ?? {
      code,
      eyebrow: "SERVICE STATUS",
      title: "服務暫時無法使用",
      reason: "系統回傳未登錄的作業錯誤。",
      impact: "只有依賴此服務的功能暫停，其他資料仍會保留。",
      retryLabel: "重試",
    }
  );
}

export function presentResolutionIssue(message: string): OperationalIssue {
  const code = /[A-Z][A-Z0-9_]+/.exec(message)?.[0] ?? "RESOLUTION_FAILED";
  if (code === "INCORRECT_SSI_CONFIGURATION") {
    return {
      code,
      eyebrow: "SSI DATA QUALITY",
      title: "Incorrect SSI — SSI 主檔資料錯誤",
      reason:
        "專用途 SSI 錯掛 generic interbank-transfer applicability，伺服器無法安全解析。",
      impact:
        "本次 Resolution 已停止；未選路徑、未產生 MT/MX，也不進交易 Repair Queue。請由 Configuration Governance 移除錯掛 applicability、建立連結核准 primary Nostro 的 purpose-built SSI，通過資料品質檢查後再試。",
      retryLabel: "重新載入修正後資料",
    };
  }
  const ownAccountReason = [
    "OWN_ACCOUNT_CURRENCY_MISMATCH",
    "OWN_ACCOUNT_RECEIVER_MISMATCH",
    "OWN_ACCOUNT_DEBIT_CREDIT_COLLISION",
  ].find((reason) => message.includes(reason));
  if (code === "OPTION_CONSTRAINT_VIOLATION" && ownAccountReason) {
    const explanations: Readonly<Record<string, string>> = {
      OWN_ACCOUNT_CURRENCY_MISMATCH:
        "借記與貸記帳戶的幣別不一致，或與交易幣別不一致。",
      OWN_ACCOUNT_RECEIVER_MISMATCH:
        "借記與貸記帳戶不是由同一個所選 Receiver 服務。",
      OWN_ACCOUNT_DEBIT_CREDIT_COLLISION:
        "借記與貸記帳戶會渲染成相同帳號，禁止從同一帳號轉回同一帳號。",
    };
    return {
      code: `${code} · ${ownAccountReason}`,
      eyebrow: "RESOLUTION VALIDATION",
      title: "自有帳戶條件不成立",
      reason: explanations[ownAccountReason] ?? ownAccountReason,
      impact: "本次 Preview 未產生；修正帳戶或 Receiver 後可再次執行。",
      retryLabel: "重新執行 Preview",
    };
  }
  if (code === "OPTION_CONSTRAINT_VIOLATION") {
    return {
      code,
      eyebrow: "RESOLUTION VALIDATION",
      title: "輸入不符合 Bank Service 約束",
      reason:
        "銀行 BIC 必須由所選 Bank Service ID 在服務端解析，不接受畫面或請求直接傳入 BIC。",
      impact: "本次 Preview 未產生；重新選擇銀行後可再次執行。",
      retryLabel: "重新執行 Preview",
    };
  }
  return {
    code,
    eyebrow: "RESOLUTION RESULT",
    title: "本次 Resolution 未完成",
    reason: message,
    impact: "未產生 settlement payload，也未建立 confirmed snapshot。",
    retryLabel: "重新執行 Preview",
  };
}
