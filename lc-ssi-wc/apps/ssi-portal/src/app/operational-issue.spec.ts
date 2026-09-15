import {
  presentOperationalIssue,
  presentResolutionIssue,
} from "./operational-issue";

describe("operational issue presentation", () => {
  it("explains Bank Service failure without claiming the message index failed", () => {
    const issue = presentOperationalIssue("BANK_SERVICE_UNAVAILABLE");

    expect(issue.title).toContain("銀行目錄");
    expect(issue.reason).toContain("Bank Service ID");
    expect(issue.impact).toContain("Message Index 仍可獨立瀏覽");
  });

  it("explains Message Index failure independently", () => {
    const issue = presentOperationalIssue("PAYMENT_MESSAGE_INDEX_UNAVAILABLE");

    expect(issue.title).toContain("Message Index");
    expect(issue.impact).toContain("銀行目錄不受影響");
  });

  it("preserves an unknown code for support diagnosis", () => {
    expect(presentOperationalIssue("UNEXPECTED_UPSTREAM").code).toBe(
      "UNEXPECTED_UPSTREAM",
    );
  });

  it("turns the Bank Service option constraint into an actionable explanation", () => {
    const issue = presentResolutionIssue(
      "OPTION_CONSTRAINT_VIOLATION · HTTP 422 · Bank BIC must be resolved from Bank Service ID",
    );

    expect(issue.title).toContain("Bank Service");
    expect(issue.reason).toContain("不接受畫面或請求直接傳入 BIC");
  });

  it("shows the exact own-account reason instead of a generic BIC message", () => {
    const issue = presentResolutionIssue(
      "OPTION_CONSTRAINT_VIOLATION · HTTP 422 · OWN_ACCOUNT_DEBIT_CREDIT_COLLISION",
    );
    expect(issue.code).toContain("OWN_ACCOUNT_DEBIT_CREDIT_COLLISION");
    expect(issue.reason).toContain("相同帳號");
  });

  it("presents incorrect SSI as configuration governance, not resolution", () => {
    const issue = presentResolutionIssue(
      "INCORRECT_SSI_CONFIGURATION · HTTP 409",
    );
    expect(issue.title).toContain("Incorrect SSI");
    expect(issue.reason).toContain("錯掛");
    expect(issue.impact).toContain("purpose-built SSI");
    expect(issue.impact).toContain("未選路徑");
    expect(issue.impact).toContain("不進交易 Repair Queue");
  });
});
