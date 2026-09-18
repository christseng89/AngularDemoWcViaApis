import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SqliteSsiRepository,
  type SsiApplicabilityInput,
  type SsiRecord,
} from "../../apps/ssi-service/src/app/sqlite-ssi.repository";

const denominator = [
  ["09E928E1-F3D1-4C9B-A10C-51707A303E4B", "HKD", 6],
  ["5547DF35-B8E3-4375-A54A-E569FC4E69FA", "USD", 6],
  ["71C01B10-581D-4892-84E5-92BD247727DA", "AUD", 6],
  ["867B9600-5A93-45A3-A4C8-EC5B008FE8CF", "USD", 2],
  ["8DE05200-E796-42CC-8806-F6E7437A20B2", "SGD", 6],
  ["AE2A71AE-A2A1-427C-8701-B519DBBF12B1", "CNY", 6],
  ["B6436323-B43E-42C6-AFD1-764A5A264E11", "EUR", 6],
  ["BFBEEC3D-E9A5-458D-8036-7419A45C6866", "CAD", 6],
  ["CD321EEF-6C2F-40A2-82C6-E835745D002E", "CHF", 6],
  ["D20BA710-2EF3-4F3D-8222-ACAFF54C4441", "JPY", 6],
  ["E73224F3-5B8B-4702-AD97-A88C87CDC3A6", "GBP", 6],
] as const;

describe("QA evidence: SSI Checker 11-record approval", () => {
  const originalPath = process.env["SSI_DATABASE_PATH"];
  const originalAuditEnvironment = {
    online: process.env["AUDIT_ONLINE_QUERY_DAYS"],
    archive: process.env["AUDIT_ARCHIVE_AFTER_DAYS"],
    retention: process.env["AUDIT_ARCHIVE_RETENTION_DAYS"],
    schedule: process.env["AUDIT_RETENTION_SCHEDULE_HOURS"],
  };
  let directory = "";

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "ssi-checker-11-qa-"));
    process.env["SSI_DATABASE_PATH"] = join(directory, "isolated.sqlite");
    process.env["AUDIT_ONLINE_QUERY_DAYS"] = "7";
    process.env["AUDIT_ARCHIVE_AFTER_DAYS"] = "30";
    process.env["AUDIT_ARCHIVE_RETENTION_DAYS"] = "365";
    process.env["AUDIT_RETENTION_SCHEDULE_HOURS"] = "24";
  });

  afterEach(() => {
    if (originalPath === undefined) delete process.env["SSI_DATABASE_PATH"];
    else process.env["SSI_DATABASE_PATH"] = originalPath;
    for (const [name, value] of [
      ["AUDIT_ONLINE_QUERY_DAYS", originalAuditEnvironment.online],
      ["AUDIT_ARCHIVE_AFTER_DAYS", originalAuditEnvironment.archive],
      ["AUDIT_ARCHIVE_RETENTION_DAYS", originalAuditEnvironment.retention],
      ["AUDIT_RETENTION_SCHEDULE_HOURS", originalAuditEnvironment.schedule],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmSync(directory, { recursive: true, force: true });
  });

  it("approves all 11 frozen identities atomically in an isolated temporary database", () => {
    const repository = new SqliteSsiRepository();
    const now = "2026-09-17T00:00:00.000Z";
    try {
      for (const [suffix, currency, applicabilityCount] of denominator) {
        const sourceId = suffix.toLowerCase();
        const revisionId = `SSI-MT12-V1-${suffix}`;
        const source: SsiRecord = {
          id: sourceId,
          counterpartyId: `CP-ANY-${currency}`,
          scope: "STANDING",
          maker: "maker.original",
          status: "ACTIVE",
          version: 10,
          route: { ssiCode: `SSI-QA-${suffix}`, currency },
          createdAt: now,
          updatedAt: now,
        };
        const revision: SsiRecord = {
          ...source,
          id: revisionId,
          maker: "maker.datafix",
          status: "PENDING_APPROVAL",
          version: 11,
          amendmentOfId: sourceId,
        };
        const applicability: SsiApplicabilityInput[] = Array.from(
          { length: applicabilityCount },
          (_, index) => ({
            consumer: "ANY",
            product: "ANY",
            businessFunction: "ANY",
            paymentLeg: `QA_LEG_${index + 1}`,
            direction: "OUTBOUND",
            status: "DRAFT",
            validFrom: "2026-01-01",
            validTo: "2027-12-31",
          }),
        );
        repository.save(source, "CREATED", source.maker);
        repository.save(revision, "SUBMIT", revision.maker);
        repository.replaceApplicability(
          revision.id,
          applicability,
          revision.maker,
        );

        expect(
          repository.approveWithApplicability(revision.id, revision.maker),
        ).toBeUndefined();
        expect(repository.find(revision.id)?.status).toBe("PENDING_APPROVAL");
        expect(repository.find(source.id)?.status).toBe("ACTIVE");
        expect(
          repository
            .listApplicability(revision.id)
            .every(({ status }) => status === "DRAFT"),
        ).toBe(true);

        expect(
          repository.approveWithApplicability(revision.id, "checker.demo"),
        ).toMatchObject({
          id: revision.id,
          status: "ACTIVE",
          checker: "checker.demo",
          version: 12,
        });
        expect(repository.find(source.id)?.status).toBe("SUPERSEDED");
        expect(repository.listApplicability(revision.id)).toHaveLength(
          applicabilityCount,
        );
        expect(
          repository
            .listApplicability(revision.id)
            .every(({ status }) => status === "ACTIVE"),
        ).toBe(true);
      }

      const audit = repository.audit();
      for (const [suffix] of denominator) {
        const revisionId = `SSI-MT12-V1-${suffix}`;
        const sourceId = suffix.toLowerCase();
        expect(
          audit.filter(
            (event) =>
              event.ssi_id === revisionId &&
              event.action === "APPLICABILITY_APPROVED" &&
              event.actor === "checker.demo",
          ),
        ).toHaveLength(1);
        expect(
          audit.filter(
            (event) =>
              event.ssi_id === revisionId &&
              event.action === "APPROVE" &&
              event.actor === "checker.demo",
          ),
        ).toHaveLength(1);
        expect(
          audit.filter(
            (event) =>
              event.ssi_id === sourceId &&
              event.action === "SUPERSEDED" &&
              event.actor === "checker.demo",
          ),
        ).toHaveLength(1);
      }
      expect(
        denominator.reduce(
          (sum, [suffix]) =>
            sum + repository.listApplicability(`SSI-MT12-V1-${suffix}`).length,
          0,
        ),
      ).toBe(62);
    } finally {
      repository.onModuleDestroy();
    }
  });
});
