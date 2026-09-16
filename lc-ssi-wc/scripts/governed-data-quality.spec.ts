import assert from "node:assert/strict";
import test from "node:test";
import {
  auditEntityRecords,
  auditNostroRecords,
  auditRmaRecords,
  auditSsiRecords,
  loadSupportedRmaMessageTypes,
  planSafeRmaRepairs,
} from "./governed-data-quality.ts";

test("SSI keeps an opaque counterparty ID separate from the bank BIC", () => {
  const issues = auditSsiRecords([
    {
      id: "SSI-1",
      status: "ACTIVE",
      counterpartyId: "CP-BOFAUS3N",
      ownerParty: "BOFAUS3N",
      publisherParty: "BOFAUS3N",
      route: {
        counterpartyType: "BANK",
        counterpartyBic: "BOFAUS3N",
        validFrom: "2026-01-01",
        validTo: "2027-12-31",
      },
    },
  ]);
  assert.equal(issues.length, 0);
});

test("SSI identifies a missing route BIC as unambiguous but revision-required", () => {
  const issues = auditSsiRecords([
    {
      id: "SSI-2",
      status: "ACTIVE",
      counterpartyId: "CP-BOFAUS3N",
      route: {
        counterpartyType: "BANK",
        validFrom: "2026-01-01",
        validTo: "2027-12-31",
      },
    },
  ]);
  assert.deepEqual(issues[0], {
    domain: "SSI",
    recordId: "SSI-2",
    severity: "ERROR",
    code: "COUNTERPARTY_BIC_MISSING",
    disposition: "REVISION_REQUIRED",
    current: undefined,
    proposed: "BOFAUS3N",
  });
});

test("RMA is distinct by own BIC, counterparty BIC and direction", () => {
  const common = {
    status: "ACTIVE",
    ownBic: "DEMOHKHH",
    counterpartyBic: "CITIUS33",
    direction: "OUTBOUND",
    validFrom: "2026-01-01",
    validTo: "2027-12-31",
  };
  const issues = auditRmaRecords(
    [
      { ...common, id: "RMA-1", service: "FIN", messageTypes: ["MT103"] },
      {
        ...common,
        id: "RMA-2",
        service: "FINPLUS",
        messageTypes: ["pacs.008.001.12"],
      },
    ],
    new Set(["MT103", "pacs.008.001.12"]),
  );
  assert.equal(
    issues.some((issue) => issue.code === "DUPLICATE_OPERATIONAL_INDEX"),
    true,
  );
});

test("RMA reports unsupported message types instead of loading them", () => {
  const issues = auditRmaRecords(
    [
      {
        id: "RMA-3",
        status: "DRAFT",
        ownBic: "DEMOHKHH",
        counterpartyBic: "CITIUS33",
        service: "FIN",
        direction: "INBOUND",
        messageTypes: ["MT103", "MT999"],
        validFrom: "2026-01-01",
        validTo: "2027-12-31",
      },
    ],
    new Set(["MT103"]),
  );
  assert.equal(
    issues.find((issue) => issue.code === "IGNORED_OUT_OF_SSI_SCOPE")?.current,
    "MT999",
  );
});

test("RMA repair plan filters out-of-scope values and stops at Draft", () => {
  assert.deepEqual(
    planSafeRmaRepairs(
      [
        {
          id: "RMA-4",
          status: "ACTIVE",
          ownBic: "DEMOHKHH",
          counterpartyBic: "CITIUS33",
          service: "FIN / FINPLUS",
          direction: "OUTBOUND",
          messageTypes: ["MT103", "MT410"],
          validFrom: "2026-01-01",
          validTo: "2027-12-31",
        },
      ],
      new Set(["MT103"]),
    ),
    [
      {
        recordId: "RMA-4",
        action: "CREATE_REVISION_DRAFT",
        removedMessageTypes: ["MT410"],
        messageTypes: ["MT103"],
        service: "FIN",
      },
    ],
  );
});

test("RMA supported parameter catalogue includes MT1/2/3/4/7 and MX", () => {
  const supported = loadSupportedRmaMessageTypes();
  for (const messageType of [
    "MT103",
    "MT202",
    "MT300",
    "MT400",
    "MT734",
    "pacs.008.001.12",
    "pacs.009.001.08",
  ]) {
    assert.equal(supported.has(messageType), true, messageType);
  }
  assert.equal(supported.has("MT101"), false);
});

test("Nostro and Entity audits detect invalid reference data", () => {
  assert.equal(
    auditNostroRecords(
      [
        {
          id: "N-1",
          status: "ACTIVE",
          ownLegalEntityId: "MISSING",
          accountServicerBic: "BAD",
          currency: "ZZZ",
          validFrom: "2027-01-01",
          validTo: "2026-01-01",
        },
      ],
      new Set(["HK01"]),
      new Set(["USD"]),
    ).length,
    4,
  );
  assert.equal(
    auditEntityRecords(
      [
        {
          id: "E-1",
          status: "ACTIVE",
          branchCode: "HK01",
          countryCode: "ZZ",
          validFrom: "2027-01-01",
          validTo: "2026-01-01",
        },
      ],
      new Set(["HK"]),
    ).length,
    2,
  );
});
