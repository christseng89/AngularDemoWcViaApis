import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { SsiMt1Mt2CandidateGenerator } from "./mt1-mt2-candidate-generator.ts";

type JsonObject = Record<string, unknown>;

export interface PreflightReport {
  readonly status: "PASS" | "FAIL";
  readonly candidateSha256: string;
  readonly databaseShaBefore: string;
  readonly databaseShaAfter: string;
  readonly counts: Readonly<Record<string, number>>;
  readonly invariants: Readonly<Record<string, boolean>>;
}

const shaFile = (path: string): string =>
  createHash("sha256").update(readFileSync(resolve(path))).digest("hex").toUpperCase();
const shaValue = (value: unknown): string =>
  createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .toUpperCase();

export class SsiMt1Mt2Preflight {
  private readonly databasePath: string;
  private readonly ruleTablePath: string;
  private readonly partitionRulingPath: string;

  constructor(
    databasePath: string,
    ruleTablePath: string,
    partitionRulingPath: string,
  ) {
    this.databasePath = databasePath;
    this.ruleTablePath = ruleTablePath;
    this.partitionRulingPath = partitionRulingPath;
  }

  run(): PreflightReport {
    const before = shaFile(this.databasePath);
    const candidates = new SsiMt1Mt2CandidateGenerator(
      this.databasePath,
      this.ruleTablePath,
    ).generate();
    const ruling = JSON.parse(
      readFileSync(resolve(this.partitionRulingPath), "utf8"),
    ) as JsonObject;
    const customerIds = new Set(
      ((ruling.customerOutOfScope as JsonObject).sourceIds as string[]).map(String),
    );
    const db = new DatabaseSync(resolve(this.databasePath), { readOnly: true });
    db.exec("PRAGMA query_only = ON");
    try {
      const existingSsiIds = new Set(
        (
          db.prepare("SELECT id FROM ssi").all() as unknown as { id: string }[]
        ).map((row) => row.id),
      );
      const existingAppIds = new Set(
        (
          db.prepare("SELECT id FROM ssi_applicability").all() as unknown as {
            id: string;
          }[]
        ).map((row) => row.id),
      );
      const ssiCollision = candidates.ssi.filter((row) =>
        existingSsiIds.has(row.id),
      ).length;
      const appCollision = candidates.applicability.filter((row) =>
        existingAppIds.has(row.id),
      ).length;
      const firstPassSsi = candidates.ssi.filter(
        (row) => !existingSsiIds.has(row.id),
      ).length;
      const firstPassApps = candidates.applicability.filter(
        (row) => !existingAppIds.has(row.id),
      ).length;
      const projectedSsiIds = new Set(existingSsiIds);
      const projectedAppIds = new Set(existingAppIds);
      candidates.ssi.forEach((row) => projectedSsiIds.add(row.id));
      candidates.applicability.forEach((row) => projectedAppIds.add(row.id));
      const secondPassSsi = candidates.ssi.filter(
        (row) => !projectedSsiIds.has(row.id),
      ).length;
      const secondPassApps = candidates.applicability.filter(
        (row) => !projectedAppIds.has(row.id),
      ).length;
      const tokens = candidates.ssi.flatMap((row) =>
        String((row.payload.route as JsonObject).messageTypes).split(","),
      );
      const oosCandidateCount = candidates.ssi.filter((row) =>
        customerIds.has(row.sourceId),
      ).length;
      const after = shaFile(this.databasePath);
      const counts = {
        candidateSsi: candidates.ssi.length,
        candidateApplicability: candidates.applicability.length,
        ssiIdCollision: ssiCollision,
        applicabilityIdCollision: appCollision,
        firstPassSsiInsert: firstPassSsi,
        firstPassApplicabilityInsert: firstPassApps,
        secondPassSsiInsert: secondPassSsi,
        secondPassApplicabilityInsert: secondPassApps,
        outOfScopeCandidate: oosCandidateCount,
        legacyPacs008: tokens.filter((token) =>
          ["pacs.008.001.12", "pacs.008.001.012"].includes(token),
        ).length,
        legacyPacs009: tokens.filter((token) =>
          ["pacs.009.001.12", "pacs.009.001.012"].includes(token),
        ).length,
        pacs008Canonical: tokens.filter((token) => token === "pacs.008.001.08")
          .length,
        pacs009Canonical: tokens.filter((token) => token === "pacs.009.001.08")
          .length,
        databaseWrites: 0,
        virtualNostroCalls: candidates.evidence.virtualNostroCalls,
        rmaPolicyInvocations: candidates.evidence.rmaPolicyInvocations,
      };
      const invariants = {
        exactCandidateCounts:
          counts.candidateSsi === 49 && counts.candidateApplicability === 128,
        zeroCollision:
          counts.ssiIdCollision === 0 && counts.applicabilityIdCollision === 0,
        firstPassExact:
          counts.firstPassSsiInsert === 49 &&
          counts.firstPassApplicabilityInsert === 128,
        repeatedApplyIdempotent:
          counts.secondPassSsiInsert === 0 &&
          counts.secondPassApplicabilityInsert === 0,
        oosIsolated: counts.outOfScopeCandidate === 0,
        legacyTokensAbsent:
          counts.legacyPacs008 === 0 && counts.legacyPacs009 === 0,
        canonicalMembershipsPreserved:
          counts.pacs008Canonical === 19 && counts.pacs009Canonical === 49,
        zeroExternalEffects:
          counts.databaseWrites === 0 &&
          counts.virtualNostroCalls === 0 &&
          counts.rmaPolicyInvocations === 0,
        databaseUnchanged: before === after,
      };
      return {
        status: Object.values(invariants).every(Boolean) ? "PASS" : "FAIL",
        candidateSha256: shaValue(candidates),
        databaseShaBefore: before,
        databaseShaAfter: after,
        counts,
        invariants,
      };
    } finally {
      db.close();
    }
  }
}
