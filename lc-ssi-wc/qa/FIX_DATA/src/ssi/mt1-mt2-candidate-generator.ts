import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

type JsonObject = Record<string, unknown>;

export interface GeneratedSsiCandidate {
  readonly id: string;
  readonly sourceId: string;
  readonly payload: JsonObject;
}

export interface GeneratedApplicabilityCandidate {
  readonly id: string;
  readonly sourceId: string;
  readonly ssiId: string;
  readonly payload: JsonObject;
}

export interface CandidateSet {
  readonly ssi: readonly GeneratedSsiCandidate[];
  readonly applicability: readonly GeneratedApplicabilityCandidate[];
  readonly evidence: {
    readonly sourceRowsRead: number;
    readonly databaseWrites: 0;
    readonly virtualNostroCalls: 0;
    readonly rmaPolicyInvocations: 0;
  };
}

const splitMessages = (value: unknown): string[] =>
  String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export class SsiMt1Mt2CandidateGenerator {
  private readonly databasePath: string;
  private readonly ruleTablePath: string;
  private readonly timestamp: string;

  constructor(
    databasePath: string,
    ruleTablePath: string,
    timestamp = "2026-09-17T00:00:00.000Z",
  ) {
    this.databasePath = databasePath;
    this.ruleTablePath = ruleTablePath;
    this.timestamp = timestamp;
  }

  generate(): CandidateSet {
    const table = JSON.parse(
      readFileSync(resolve(this.ruleTablePath), "utf8"),
    ) as { rows: JsonObject[] };
    const executable = table.rows.filter((row) =>
      ["CONVERT", "REMOVE_SOURCE_TOKEN"].includes(
        String(row.mutationDisposition),
      ),
    );
    const bySource = new Map<string, JsonObject[]>();
    for (const rule of executable) {
      const sourceId = String(
        (rule.inputCondition as JsonObject).sourceRecordId,
      );
      bySource.set(sourceId, [...(bySource.get(sourceId) ?? []), rule]);
    }

    const db = new DatabaseSync(resolve(this.databasePath), { readOnly: true });
    db.exec("PRAGMA query_only = ON");
    try {
      const ssi: GeneratedSsiCandidate[] = [];
      const applicability: GeneratedApplicabilityCandidate[] = [];
      for (const [sourceId, rules] of [...bySource.entries()].sort(([a], [b]) =>
        a.localeCompare(b),
      )) {
        const source = db.prepare("SELECT payload FROM ssi WHERE id = ?").get(
          sourceId,
        ) as { payload: string } | undefined;
        if (!source) throw new Error(`SOURCE_NOT_FOUND:${sourceId}`);
        const payload = JSON.parse(source.payload) as JsonObject;
        if (String(payload.status) !== "ACTIVE")
          throw new Error(`SOURCE_NOT_ACTIVE:${sourceId}`);
        const route = structuredClone(payload.route as JsonObject);
        const tokens = new Set(splitMessages(route.messageTypes));
        for (const rule of rules) {
          tokens.delete(String(rule.sourceToken));
          tokens.add(String((rule.inputCondition as JsonObject).targetToken));
          if (String(rule.amendmentOfId) !== sourceId)
            throw new Error(`LINEAGE_MISMATCH:${sourceId}`);
        }
        const counterpartyTypes = new Set(
          rules.map((rule) => String(rule.counterpartyType)),
        );
        const counterpartyBics = new Set(
          rules.map((rule) => String(rule.counterpartyBic)),
        );
        if (counterpartyTypes.size !== 1 || counterpartyBics.size !== 1)
          throw new Error(`COUNTERPARTY_BINDING_AMBIGUOUS:${sourceId}`);
        route.counterpartyType = [...counterpartyTypes][0];
        route.counterpartyBic = [...counterpartyBics][0];
        const successorId = String(rules[0].successorRecordId);
        route.messageTypes = [...tokens].sort().join(",");
        const successorPayload: JsonObject = {
          ...structuredClone(payload),
          id: successorId,
          route,
          status: "DRAFT",
          version: Number(payload.version) + 1,
          amendmentOfId: sourceId,
          maker: "maker.datafix",
          checker: "",
          createdAt: this.timestamp,
          updatedAt: this.timestamp,
        };
        ssi.push({ id: successorId, sourceId, payload: successorPayload });

        const sourceApps = db
          .prepare(
            "SELECT id, payload FROM ssi_applicability WHERE ssi_id = ? ORDER BY id",
          )
          .all(sourceId) as unknown as { id: string; payload: string }[];
        for (const [index, sourceApp] of sourceApps
          .filter((entry) => String((JSON.parse(entry.payload) as JsonObject).status) === "ACTIVE")
          .entries()) {
          const appPayload = JSON.parse(sourceApp.payload) as JsonObject;
          const id = `${successorId}:APPL:${index + 1}`;
          applicability.push({
            id,
            sourceId: sourceApp.id,
            ssiId: successorId,
            payload: {
              ...structuredClone(appPayload),
              id,
              ssiId: successorId,
              status: "DRAFT",
              version: Number(appPayload.version) + 1,
              amendmentOfId: sourceApp.id,
              createdAt: this.timestamp,
              updatedAt: this.timestamp,
            },
          });
        }
      }
      return {
        ssi,
        applicability,
        evidence: {
          sourceRowsRead: bySource.size,
          databaseWrites: 0,
          virtualNostroCalls: 0,
          rmaPolicyInvocations: 0,
        },
      };
    } finally {
      db.close();
    }
  }
}
