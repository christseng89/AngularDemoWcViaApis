/* MT2xx 正向路徑實測 probe — 輸出完整鍵樹，不做判斷
   用法（專案根目錄，服務需已啟動）：
     node qa/tests/shared/run-claude-mt2-probe.mjs
   可選：API_BASE=http://localhost:3100/api node qa/tests/shared/run-claude-mt2-probe.mjs
*/
/* global process, console, fetch, crypto */
import { writeFile } from "node:fs/promises";
import path from "node:path";

const CANDIDATE_BASES = process.env.API_BASE
  ? [process.env.API_BASE]
  : ["http://localhost:3101/api", "http://localhost:3100/api"];

let API = null;
for (const base of CANDIDATE_BASES) {
  try {
    const r = await fetch(`${base}/settlements/message-index`, { method: "GET" });
    if (r.ok || r.status === 404) { API = base; break; }
  } catch { /* next */ }
}
if (!API) { console.error("找不到可用的 API base，試過：", CANDIDATE_BASES.join(", ")); process.exit(1); }
console.log("API base =", API);

// ---- 完整鍵樹（不截斷結構，只截斷過長字串）----
const keyTree = (value, prefix = "", out = []) => {
  if (Array.isArray(value)) {
    out.push(`${prefix} : array[${value.length}]`);
    if (value.length) keyTree(value[0], `${prefix}[0]`, out);
  } else if (value && typeof value === "object") {
    if (prefix) out.push(`${prefix} : object{${Object.keys(value).length}}`);
    for (const k of Object.keys(value)) keyTree(value[k], prefix ? `${prefix}.${k}` : k, out);
  } else {
    const v = typeof value === "string" && value.length > 60 ? value.slice(0, 60) + "…" : JSON.stringify(value);
    out.push(`${prefix} = ${v}`);
  }
  return out;
};

const results = [];
const call = async (name, body) => {
  let status = null, json = null, error = null;
  try {
    const r = await fetch(`${API}/settlements/resolve`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    status = r.status;
    const t = await r.text();
    try { json = JSON.parse(t); } catch { json = t; }
  } catch (e) { error = String(e); }
  results.push({ name, status, error, request: body, response: json });
};

const base = {
  consumer: "TRADE_FINANCE", product: "IMPORT_LC",
  businessFunction: "IMPORT_LC_BANK_REIMBURSEMENT", paymentLeg: "BANK_REIMBURSEMENT",
  direction: "OUTBOUND", currency: "USD", bookingEntity: "HK01",
  valueDate: new Date().toISOString().slice(0, 10), amount: "1000000",
  messageType: "pacs.009.001.08", sourceMessageType: "MT202",
};
const u = () => crypto.randomUUID();

// A. generic / counterparty 路徑（受控 applicability）
await call("A1_GEN_CITIUS33", { ...base, correlationId: u(), transactionReference: "A1", counterpartyBankServiceId: "BANK-SVC-CITIUS33" });
await call("A2_GEN_CHASUS33", { ...base, correlationId: u(), transactionReference: "A2", counterpartyBankServiceId: "BANK-SVC-CHASUS33" });

// B. generic / counterparty 路徑（overlay applicability，對照組）
const ov = { ...base, consumer: "CENTRAL_PAYMENT", product: "CENTRAL_PAYMENT",
  businessFunction: "INTERBANK_TRANSFER", paymentLeg: "INTERBANK_SETTLEMENT" };
await call("B1_OVERLAY_CITIUS33", { ...ov, correlationId: u(), transactionReference: "B1", counterpartyBankServiceId: "BANK-SVC-CITIUS33" });
await call("B2_OVERLAY_BARCGB22", { ...ov, correlationId: u(), transactionReference: "B2", counterpartyBankServiceId: "BANK-SVC-BARCGB22" });

// C. own-account 情境（nostroId 請確認仍存在於目前資料庫）
const N = {
  P: ["fe5d672f-311e-4eb9-88bf-f8538d45793c", 4], // DEMO-NOSTRO-001-PRIMARY  CITIUS33 USD
  E: ["d28b0fc3-a0d8-4e16-a5e4-64325760b331", 4], // DEMO-NOSTRO-001-EXPCOLL  CITIUS33 USD
  NS_A: ["0f56135e-b198-42d1-a1b7-b1b34bb1266f", 4], // DEMO-NORTHSTAR-USD-001 (BACKUP)
  NS_B: ["d633da6c-034e-47a6-8d73-24e0dbf5ee7e", 4], // DEMO-NORTHSTAR-USD-001 (PRIMARY)
  HK: ["f976e74f-4f58-4efd-86b9-48921a3db5a0", 9], // DEMO-NOSTRO-006-PRIMARY HSBCHKHH HKD
  SEC: ["d4ee3d85-7ad4-4767-9046-33a050705a78", 4], // DEMO-NOSTRO-001-SECONDARY HSBCHKHH USD
};
const book = (name, dbt, cdt, rcv, extra = {}) => call(name, {
  ...base, ...extra, correlationId: u(), transactionReference: name,
  scenarioCode: "BOOK_TRANSFER_SAME_RECEIVER", receiverBankServiceId: rcv,
  ownDebitAccountId: dbt[0], ownDebitAccountVersion: dbt[1],
  ownCreditAccountId: cdt[0], ownCreditAccountVersion: cdt[1],
});
await book("C1_BOOK_ok", N.P, N.E, "BANK-SVC-CITIUS33");
await book("C2_BOOK_same_reference", N.NS_A, N.NS_B, "BANK-SVC-CITIUS33");
await book("C3_BOOK_currency_mismatch", N.HK, N.SEC, "BANK-SVC-HSBCHKHH");
await book("C4_BOOK_receiver_mismatch", N.P, N.SEC, "BANK-SVC-CITIUS33");
await call("C5_SCN_57A", {
  ...base, correlationId: u(), transactionReference: "C5",
  scenarioCode: "CREDIT_ONE_OF_SEVERAL_AT_57A", receiverBankServiceId: "BANK-SVC-CITIUS33",
  ownCreditAccountId: N.E[0], ownCreditAccountVersion: N.E[1],
});

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const rawPath = path.resolve(root, `qa/reports/CLAUDE_MT2_PROBE_${stamp}.json`);
const treePath = path.resolve(root, `qa/reports/CLAUDE_MT2_PROBE_${stamp}.keytree.txt`);
await writeFile(rawPath, JSON.stringify({ apiBase: API, generatedAt: new Date().toISOString(), results }, null, 1), "utf8");

const lines = [];
for (const r of results) {
  lines.push("=".repeat(72));
  lines.push(`CASE ${r.name}   HTTP ${r.status ?? "ERR"}${r.error ? "  " + r.error : ""}`);
  lines.push("-".repeat(72));
  lines.push(...keyTree(r.response ?? {}, "", []));
  lines.push("");
}
await writeFile(treePath, lines.join("\n"), "utf8");

console.log("\n---- 摘要（僅事實，不做判定）----");
for (const r of results) {
  const top = r.response && typeof r.response === "object" ? Object.keys(r.response) : [];
  console.log(`${r.name.padEnd(26)} HTTP ${String(r.status).padEnd(4)} top-level: ${top.join(",") || r.error}`);
}
console.log("\nraw     :", rawPath);
console.log("keytree :", treePath);
