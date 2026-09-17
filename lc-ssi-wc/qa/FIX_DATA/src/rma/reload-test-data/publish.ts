import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { RmaSupportedMessageTypeCatalogue } from "../../../../../libs/parameter-engine/src/lib/rma-supported-message-type-catalogue.ts";

interface RmaRecord {
  readonly id: string;
  readonly ownBic: string;
  readonly counterpartyBic: string;
  readonly direction: "INBOUND" | "OUTBOUND";
  readonly messageTypes: readonly string[];
  readonly validFrom: string;
  readonly validTo: string;
  readonly maker: string;
  readonly source: "SYNTHETIC_DEMO" | "LICENSED_IMPORT";
  readonly status: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly [key: string]: unknown;
}

interface PublicationOptions {
  readonly sourceDatabase: string;
  readonly repairedDatabase: string;
  readonly repairedAt: string;
}

export interface PublicationReport {
  readonly sourceDatabase: string;
  readonly repairedDatabase: string;
  readonly rmaActiveBefore: number;
  readonly rmaActiveAfter: number;
  readonly canonicalGroups: number;
  readonly supersededRecords: number;
  readonly skippedGroups: number;
  readonly skippedRecords: number;
  readonly convertedMessageTypes: number;
  readonly excludedMessageTypes: number;
}

const canonicalBic = (value: string): string => {
  const bic = value.trim().toUpperCase();
  return bic.length === 8 ? `${bic}XXX` : bic;
};

const canonicalKey = (record: RmaRecord): string =>
  `${canonicalBic(record.ownBic)}|${canonicalBic(record.counterpartyBic)}|${record.direction}`;

const uniqueSorted = (values: Iterable<string>): string[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right));

const deterministicUuid = (value: string): string => {
  const bytes = Buffer.from(
    createHash("sha1").update(value).digest().subarray(0, 16),
  );
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export class RmaReloadRepairPolicy {
  private readonly supported: ReadonlySet<string>;
  private readonly conversions: ReadonlyMap<string, string>;
  private readonly skipKeys: ReadonlySet<string>;

  constructor(input: {
    readonly supportedMessageTypes: Iterable<string>;
    readonly conversions: Iterable<readonly [string, string]>;
    readonly skipKeys: Iterable<string>;
  }) {
    this.supported = new Set(input.supportedMessageTypes);
    this.conversions = new Map(input.conversions);
    this.skipKeys = new Set(input.skipKeys);
  }

  static fromWorkspace(workspace = process.cwd()): RmaReloadRepairPolicy {
    const policy =
      RmaSupportedMessageTypeCatalogue.fromWorkspace(workspace).loadPolicy();
    return new RmaReloadRepairPolicy({
      supportedMessageTypes: policy.supportedMessageTypes,
      conversions: policy.legacyConversions.map(
        (item) => [item.from, item.to] as const,
      ),
      skipKeys: policy.developmentReferenceGapSkips.map(
        (item) => item.canonicalKey,
      ),
    });
  }

  shouldSkip(key: string): boolean {
    return this.skipKeys.has(key);
  }

  normalize(messageTypes: Iterable<string>): {
    readonly retained: string[];
    readonly converted: number;
    readonly excluded: number;
    readonly convertedFrom: string[];
    readonly convertedTo: string[];
  } {
    let converted = 0;
    let excluded = 0;
    const retained: string[] = [];
    const convertedFrom: string[] = [];
    const convertedTo: string[] = [];
    for (const raw of messageTypes) {
      const value = raw.trim();
      const normalized = this.conversions.get(value) ?? value;
      if (normalized !== value) {
        converted += 1;
        convertedFrom.push(value);
        convertedTo.push(normalized);
      }
      if (this.supported.has(normalized)) retained.push(normalized);
      else excluded += 1;
    }
    return {
      retained: uniqueSorted(retained),
      converted,
      excluded,
      convertedFrom: uniqueSorted(convertedFrom),
      convertedTo: uniqueSorted(convertedTo),
    };
  }
}

export class RmaReloadDataRepairer {
  private readonly policy: RmaReloadRepairPolicy;

  constructor(policy: RmaReloadRepairPolicy) {
    this.policy = policy;
  }

  repair(options: PublicationOptions): PublicationReport {
    const source = resolve(options.sourceDatabase);
    const target = resolve(options.repairedDatabase);
    if (source === target) throw new Error("SOURCE_AND_TARGET_MUST_DIFFER");
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);

    const database = new DatabaseSync(target);
    try {
      database.exec(
        "PRAGMA journal_mode=DELETE; PRAGMA foreign_keys=ON; BEGIN IMMEDIATE",
      );
      const records = database
        .prepare("SELECT payload FROM rma_authorisation")
        .all()
        .map((row) => JSON.parse(String(row["payload"])) as RmaRecord);
      const active = records.filter((record) => record.status === "ACTIVE");
      const groups = new Map<string, RmaRecord[]>();
      for (const record of active) {
        const key = canonicalKey(record);
        const group = groups.get(key) ?? [];
        group.push(record);
        groups.set(key, group);
      }

      let canonicalGroups = 0;
      let supersededRecords = 0;
      let skippedGroups = 0;
      let skippedRecords = 0;
      let convertedMessageTypes = 0;
      let excludedMessageTypes = 0;
      for (const [key, group] of [...groups].sort(([left], [right]) =>
        left.localeCompare(right),
      )) {
        if (this.policy.shouldSkip(key)) {
          skippedGroups += 1;
          skippedRecords += group.length;
          continue;
        }
        const sourceTypes = uniqueSorted(
          group.flatMap((record) => record.messageTypes.map((value) => value.trim())),
        );
        const normalized = this.policy.normalize(
          group.flatMap((record) => record.messageTypes),
        );
        if (normalized.retained.length === 0)
          throw new Error(`EMPTY_CANONICAL_RMA_GROUP:${key}`);
        convertedMessageTypes += normalized.converted;
        excludedMessageTypes += normalized.excluded;
        const survivor = [...group].sort(
          (left, right) =>
            right.version - left.version ||
            right.updatedAt.localeCompare(left.updatedAt) ||
            right.id.localeCompare(left.id),
        )[0]!;
        for (const record of group) {
          const superseded = {
            ...record,
            status: "SUPERSEDED",
            version: record.version + 1,
            updatedAt: options.repairedAt,
          };
          this.save(
            database,
            superseded,
            "SUPERSEDED_BY_RELOAD_DATA_REPAIR",
            options.repairedAt,
          );
          supersededRecords += 1;
        }
        const id = deterministicUuid(`RMA-RELOAD-V15.4|${key}`);
        const services = uniqueSorted(
          normalized.retained.map((messageType) =>
            messageType.startsWith("MT") ? "FIN" : "FINPLUS",
          ),
        ) as ("FIN" | "FINPLUS")[];
        const sourceTypeSet = new Set(sourceTypes);
        const retainedSet = new Set(normalized.retained);
        const convertedTargets = new Set(normalized.convertedTo);
        const canonical: RmaRecord = {
          id,
          ownBic: survivor.ownBic,
          counterpartyBic: survivor.counterpartyBic,
          direction: survivor.direction,
          service: services.length === 2 ? "FIN / FINPLUS" : services[0],
          services,
          messageTypes: normalized.retained,
          validFrom: group.map((record) => record.validFrom).sort()[0]!,
          validTo: group.map((record) => record.validTo).sort().at(-1)!,
          maker: "maker.datafix",
          checker: "checker.datafix",
          source: "SYNTHETIC_DEMO",
          status: "ACTIVE",
          version: Math.max(...group.map((record) => record.version)) + 1,
          amendmentOfId: survivor.id,
          createdAt: options.repairedAt,
          updatedAt: options.repairedAt,
          messageTypeChanges: {
            unchanged: sourceTypes.filter(
              (value) =>
                retainedSet.has(value) && !convertedTargets.has(value),
            ),
            added: normalized.retained.filter(
              (value) =>
                convertedTargets.has(value) || !sourceTypeSet.has(value),
            ),
            suppressed: sourceTypes.filter(
              (value) => !retainedSet.has(value),
            ),
          },
          repairProvenance: {
            policy: "PARAMETER_DRIVEN_RMA_SCOPE_SR2026",
            canonicalKey: key,
            sourceRecordIds: group.map((record) => record.id).sort(),
          },
        };
        this.save(
          database,
          canonical,
          "RELOAD_DATA_REPAIR_ACTIVATED",
          options.repairedAt,
        );
        canonicalGroups += 1;
      }
      database.exec("COMMIT");
      const integrity = String(
        database.prepare("PRAGMA integrity_check").get()?.["integrity_check"],
      );
      if (integrity !== "ok")
        throw new Error(`REPAIRED_DATABASE_INTEGRITY_FAILED:${integrity}`);
      const rmaActiveAfter = Number(
        database
          .prepare(
            "SELECT count(*) AS total FROM rma_authorisation " +
              "WHERE json_extract(payload,'$.status')='ACTIVE'",
          )
          .get()?.["total"],
      );
      return {
        sourceDatabase: source,
        repairedDatabase: target,
        rmaActiveBefore: active.length,
        rmaActiveAfter,
        canonicalGroups,
        supersededRecords,
        skippedGroups,
        skippedRecords,
        convertedMessageTypes,
        excludedMessageTypes,
      };
    } catch (error) {
      if (database.isTransaction) database.exec("ROLLBACK");
      throw error;
    } finally {
      database.close();
    }
  }

  private save(
    database: DatabaseSync,
    record: RmaRecord,
    action: string,
    occurredAt: string,
  ): void {
    const payload = JSON.stringify(record);
    database
      .prepare(
        "INSERT INTO rma_authorisation(id,payload,updated_at) VALUES(?,?,?) " +
          "ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at",
      )
      .run(record.id, payload, occurredAt);
    database
      .prepare(
        "INSERT INTO rma_audit_event(record_id,action,actor,payload,occurred_at) VALUES(?,?,?,?,?)",
      )
      .run(record.id, action, "checker.datafix", payload, occurredAt);
  }
}

const argument = (name: string, fallback: string): string => {
  const prefix = `--${name}=`;
  return (
    process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ??
    fallback
  );
};

if (import.meta.url === `file:///${process.argv[1]?.replaceAll("\\", "/")}`) {
  const report = new RmaReloadDataRepairer(
    RmaReloadRepairPolicy.fromWorkspace(),
  ).repair({
    sourceDatabase: argument("source", "data/ssi-demo.sqlite"),
    repairedDatabase: argument(
      "target",
      "tmp/ssi-demo.v15.4.repaired.sqlite",
    ),
    repairedAt: argument("repaired-at", "2026-09-17T00:00:00.000Z"),
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
