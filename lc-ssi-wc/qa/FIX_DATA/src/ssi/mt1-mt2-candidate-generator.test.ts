import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { SsiMt1Mt2CandidateGenerator } from "./mt1-mt2-candidate-generator.ts";

const createGenerator = () =>
  new SsiMt1Mt2CandidateGenerator(
    "data/ssi-demo.sqlite",
    "qa/FIX_DATA/ssi/mt1-mt2/repair-rule-table.v1.json",
  );
const sha = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

test("generates the exact Round 5 candidate graph without writes", () => {
  const result = createGenerator().generate();
  assert.equal(result.ssi.length, 49);
  assert.equal(result.applicability.length, 128);
  assert.equal(new Set(result.ssi.map((row) => row.id)).size, 49);
  assert.equal(
    new Set(result.applicability.map((row) => row.id)).size,
    128,
  );
  assert.deepEqual(result.evidence, {
    sourceRowsRead: 49,
    databaseWrites: 0,
    virtualNostroCalls: 0,
    rmaPolicyInvocations: 0,
  });
  assert.equal(
    result.ssi.every(
      (row) =>
        row.payload.status === "DRAFT" &&
        row.payload.amendmentOfId === row.sourceId,
    ),
    true,
  );
  assert.equal(
    result.applicability.every(
      (row) => row.payload.status === "DRAFT" && row.payload.ssiId === row.ssiId,
    ),
    true,
  );
});

test("preserves pacs.009 as .001.08 and removes every legacy .001.12 token", () => {
  const result = createGenerator().generate();
  const messages = result.ssi.flatMap((row) =>
    String((row.payload.route as Record<string, unknown>).messageTypes).split(","),
  );
  assert.equal(messages.includes("pacs.008.001.12"), false);
  assert.equal(messages.includes("pacs.009.001.12"), false);
  // 43 governed pacs.009 conversion groups plus six pacs.008-only sources
  // that already contain a valid pacs.009.001.08 token. Those six are
  // preserved; pacs.009 is never removed merely to match a scoped count.
  assert.equal(messages.filter((item) => item === "pacs.009.001.08").length, 49);
  assert.equal(messages.filter((item) => item === "pacs.008.001.08").length, 19);
});

test("is deterministic across repeated generation", () => {
  assert.equal(sha(createGenerator().generate()), sha(createGenerator().generate()));
});

test("materializes the exact approved counterparty binding into every route", () => {
  const result = createGenerator().generate();
  const rules = JSON.parse(
    readFileSync("qa/FIX_DATA/ssi/mt1-mt2/repair-rule-table.v1.json", "utf8"),
  ) as { rows: Array<Record<string, unknown>> };
  const expected = new Map<string, { type: string; bic: string }>();
  for (const rule of rules.rows.filter((row) =>
    ["CONVERT", "REMOVE_SOURCE_TOKEN"].includes(String(row.mutationDisposition)),
  )) {
    const sourceId = String(
      (rule.inputCondition as Record<string, unknown>).sourceRecordId,
    );
    expected.set(sourceId, {
      type: String(rule.counterpartyType),
      bic: String(rule.counterpartyBic),
    });
  }
  assert.equal(expected.size, 49);
  for (const item of result.ssi) {
    const route = item.payload.route as Record<string, unknown>;
    assert.deepEqual(
      { type: route.counterpartyType, bic: route.counterpartyBic },
      expected.get(item.sourceId),
    );
  }
});

test("reconciles the exact 128 source applicability identities without count compensation", () => {
  const result = createGenerator().generate();
  const database = new DatabaseSync("data/ssi-demo.sqlite", { readOnly: true });
  database.exec("PRAGMA query_only=ON");
  try {
    const expected = result.ssi.flatMap((ssi) =>
      (
        database
          .prepare(
            "SELECT id FROM ssi_applicability WHERE ssi_id=? " +
              "AND json_extract(payload,'$.status')='ACTIVE' ORDER BY id",
          )
          .all(ssi.sourceId) as unknown as { id: string }[]
      ).map((row) => `${row.id}->${ssi.id}`),
    );
    const actual = result.applicability
      .map((item) => `${item.sourceId}->${item.ssiId}`)
      .sort();
    assert.equal(new Set(expected).size, 128);
    assert.equal(new Set(actual).size, 128);
    assert.deepEqual(actual, expected.sort());
  } finally {
    database.close();
  }
});
