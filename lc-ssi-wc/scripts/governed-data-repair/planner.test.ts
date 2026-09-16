import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GovernedDataRepairPlanner,
  InMemoryGovernedDataRepository,
  InMemoryRepairReportWriter,
} from "./planner.ts";
import type { GovernedDataSnapshot } from "./repair-contracts.ts";

const snapshot: GovernedDataSnapshot = {
  entities: [
    {
      id: "ENTITY-1",
      status: "ACTIVE",
      legalEntityCode: "HK01",
      branchCode: "HK01",
      countryCode: "HK",
      validFrom: "2026-01-01",
      validTo: "2027-12-31",
    },
  ],
  nostros: [
    {
      id: "NOSTRO-1",
      status: "ACTIVE",
      ownLegalEntityId: "HK01",
      accountServicerBic: "CITIUS33",
      currency: "USD",
      purpose: "SETTLEMENT",
      maskedAccountRef: "DEMO-USD-1",
      validFrom: "2026-01-01",
      validTo: "2027-12-31",
    },
  ],
  ssis: [
    {
      id: "SSI-1",
      status: "DRAFT",
      ownershipType: "COUNTERPARTY",
      ownerParty: "BOFAUS3N",
      publisherParty: "BOFAUS3N",
      counterpartyId: "CP-BOFAUS3N",
      scope: "STANDING",
      route: {
        counterpartyType: "BANK",
        counterpartyBic: "CP-BOFAUS3N",
        bookingEntity: "HK01",
        currency: "USD",
        businessFunction: "SETTLEMENT",
        validFrom: "2026-01-01",
        validTo: "2027-12-31",
      },
    },
  ],
  rmas: [
    {
      id: "RMA-1",
      status: "ACTIVE",
      version: 1,
      ownBic: "DEMOHKHH",
      counterpartyBic: "CITIUS33",
      direction: "OUTBOUND",
      service: "FINPLUS",
      messageTypes: ["pacs.008.001.12", "MT103"],
    },
    {
      id: "RMA-2",
      status: "ACTIVE",
      version: 2,
      ownBic: "DEMOHKHHXXX",
      counterpartyBic: "CITIUS33XXX",
      direction: "OUTBOUND",
      service: "FINPLUS",
      messageTypes: ["pacs.008.001.08"],
    },
  ],
  reference: {
    countries: ["HK"],
    currencies: ["USD"],
    bankBics: ["CITIUS33XXX", "BOFAUS3NXXX", "DEMOHKHHXXX"],
    supportedRmaMessageTypes: ["MT103", "pacs.008.001.08"],
    legacyRmaMessageTypeConversions: [
      {
        from: "pacs.008.001.12",
        to: "pacs.008.001.08",
        scope: "OPERATIONAL_OR_DRAFT_POSITIVE_DATA",
        reason: "test parameter",
      },
    ],
    parameterSnapshotId: "PARAMETERS-1",
  },
};

describe("GovernedDataRepairPlanner", () => {
  it("plans all four domains and cross-table validation in one report", async () => {
    const repository = new InMemoryGovernedDataRepository(snapshot);
    const writer = new InMemoryRepairReportWriter();
    const planner = GovernedDataRepairPlanner.standard(repository, writer, 4);

    const report = await planner.execute();

    assert.equal(report.mode, "DRY_RUN_ZERO_WRITES");
    assert.equal(report.metrics.databaseWrites, 0);
    assert.equal(report.domains.ENTITY.recordCount, 1);
    assert.equal(report.domains.NOSTRO.recordCount, 1);
    assert.equal(report.domains.SSI.recordCount, 1);
    assert.equal(report.domains.RMA.recordCount, 2);
    assert.equal(writer.lastReport, report);
  });

  it("derives the invalid CP-prefixed SSI BIC as a safe Draft repair", async () => {
    const planner = GovernedDataRepairPlanner.standard(
      new InMemoryGovernedDataRepository(snapshot),
      new InMemoryRepairReportWriter(),
      4,
    );

    const report = await planner.execute();
    const issue = report.domains.SSI.issues.find(
      (candidate) => candidate.code === "COUNTERPARTY_BIC_INVALID",
    );

    assert.equal(issue?.recordId, "SSI-1");
    assert.equal(issue?.proposed, "BOFAUS3N");
    assert.equal(issue?.disposition, "DRAFT_CAN_UPDATE");
  });

  it("converts legacy pacs.008.001.12 to governed pacs.008.001.08", async () => {
    const planner = GovernedDataRepairPlanner.standard(
      new InMemoryGovernedDataRepository(snapshot),
      new InMemoryRepairReportWriter(),
      4,
    );

    const report = await planner.execute();
    const group = report.domains.RMA.groups[0];

    assert.equal(group?.canonicalKey, "DEMOHKHHXXX|CITIUS33XXX|OUTBOUND");
    assert.deepEqual(group?.retainedMessageTypes, ["MT103", "pacs.008.001.08"]);
    assert.deepEqual(group?.removedMessageTypes, []);
    assert.equal(group?.conversions.length, 1);
    assert.equal(group?.conversions[0]?.from, "pacs.008.001.12");
    assert.equal(group?.conversions[0]?.to, "pacs.008.001.08");
    assert.equal(group?.conversions[0]?.occurrences, 1);
  });

  it("infers ANY_BANK for legacy SSI records whose BIC is ANY", async () => {
    const anyBankSnapshot: GovernedDataSnapshot = {
      ...snapshot,
      ssis: [
        {
          id: "SSI-ANY",
          status: "ACTIVE",
          ownershipType: "OWN",
          ownerParty: "HK01",
          publisherParty: "HK01",
          counterpartyId: "ANY",
          scope: "STANDING",
          route: {
            counterpartyBic: "ANY",
            bookingEntity: "HK01",
            currency: "USD",
            businessFunction: "SETTLEMENT",
            validFrom: "2026-01-01",
            validTo: "2027-12-31",
          },
        },
      ],
    };
    const planner = GovernedDataRepairPlanner.standard(
      new InMemoryGovernedDataRepository(anyBankSnapshot),
      new InMemoryRepairReportWriter(),
      4,
    );

    const report = await planner.execute();

    assert.equal(report.domains.SSI.recordCount, 1);
    assert.equal(
      report.domains.SSI.issues.some(
        (issue) => issue.code === "INVALID_SSI_IDENTITY",
      ),
      false,
    );
  });

  it("uses active applicability dates when legacy SSI route dates are absent", async () => {
    const applicabilitySnapshot: GovernedDataSnapshot = {
      ...snapshot,
      ssis: [
        {
          id: "SSI-APPLICABILITY",
          status: "ACTIVE",
          ownershipType: "COUNTERPARTY",
          ownerParty: "BOFAUS3N",
          publisherParty: "BOFAUS3N",
          counterpartyId: "BOFAUS3N",
          scope: "STANDING",
          route: {
            counterpartyType: "BANK",
            counterpartyBic: "BOFAUS3N",
            bookingEntity: "HK01",
            currency: "USD",
            businessFunction: "SETTLEMENT",
          },
          applicability: [
            {
              status: "ACTIVE",
              validFrom: "2026-01-01",
              validTo: "2027-12-31",
            },
          ],
        },
      ],
    };
    const planner = GovernedDataRepairPlanner.standard(
      new InMemoryGovernedDataRepository(applicabilitySnapshot),
      new InMemoryRepairReportWriter(),
      4,
    );

    const report = await planner.execute();

    assert.equal(
      report.domains.SSI.issues.some(
        (issue) => issue.code === "INVALID_EFFECTIVE_DATE",
      ),
      false,
    );
  });
});
