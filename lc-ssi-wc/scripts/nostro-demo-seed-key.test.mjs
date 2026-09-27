import assert from "node:assert/strict";
import test from "node:test";
import {
  duplicateActiveNostros,
  findCurrentSeedNostro,
  stableNostroSeedKey,
} from "./nostro-demo-seed-key.mjs";

const base = {
  id: "N-1",
  ownLegalEntityId: "HK01",
  accountServicerBic: "SMBCJPJT",
  currency: "JPY",
  purpose: "SETTLEMENT",
  maskedAccountRef: "DEMO-JPY-PRIMARY",
  status: "ACTIVE",
  version: 1,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

test("builds a normalized stable business key", () => {
  assert.equal(
    stableNostroSeedKey({
      ...base,
      accountServicerBic: "smbcjpjt",
      currency: "jpy",
    }),
    "HK01|SMBCJPJT|JPY|SETTLEMENT|DEMO-JPY-PRIMARY",
  );
});

test("reuses the existing active record when the demo seed is rerun", () => {
  assert.equal(
    findCurrentSeedNostro(
      [base, { ...base, id: "OLD", status: "SUPERSEDED" }],
      { ...base, id: "NEW" },
      "maker.swiftdata",
    )?.id,
    "N-1",
  );
});

test("finds only exact active business-key duplicates for governed suppression", () => {
  const duplicate = {
    ...base,
    id: "N-2",
    version: 2,
    updatedAt: "2026-02-01T00:00:00.000Z",
  };
  const backup = {
    ...base,
    id: "N-BACKUP",
    maskedAccountRef: "DEMO-JPY-BACKUP",
  };
  assert.deepEqual(duplicateActiveNostros([base, duplicate, backup]), [base]);
});
