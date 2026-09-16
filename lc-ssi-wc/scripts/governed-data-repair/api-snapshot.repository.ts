import { createHash } from "node:crypto";
import type {
  EntityRecord,
  GovernedDataRepository,
  GovernedDataSnapshot,
  NostroRecord,
  RmaRecord,
  SsiRecord,
} from "./repair-contracts.ts";

export interface JsonHttpClient {
  get(path: string): Promise<unknown>;
}

export class FetchJsonHttpClient implements JsonHttpClient {
  private readonly apiBase: string;

  constructor(apiBase: string) {
    this.apiBase = apiBase.replace(/\/$/, "");
  }

  async get(path: string): Promise<unknown> {
    const response = await fetch(`${this.apiBase}/${path}`, {
      method: "GET",
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(
        `GET_FAILED:${path}:${response.status}:${await response.text()}`,
      );
    }
    return response.json();
  }
}

class RawDomainResponsePolicy {
  requireArray<T>(domain: string, response: unknown): readonly T[] {
    if (!Array.isArray(response)) {
      throw new Error(`RAW_DOMAIN_RESPONSE_REQUIRED:${domain}`);
    }
    return response as readonly T[];
  }
}

class ReferenceProjectionPolicy {
  items(response: unknown, source: string): readonly Record<string, unknown>[] {
    if (Array.isArray(response)) return response as Record<string, unknown>[];
    if (response && typeof response === "object") {
      const items = (response as { items?: unknown }).items;
      if (Array.isArray(items)) return items as Record<string, unknown>[];
    }
    throw new Error(`REFERENCE_RESPONSE_INVALID:${source}`);
  }

  strings(response: unknown, source: string): readonly string[] {
    if (
      !Array.isArray(response) ||
      !response.every((value) => typeof value === "string")
    ) {
      throw new Error(`STRING_REFERENCE_RESPONSE_INVALID:${source}`);
    }
    return response as string[];
  }

  rmaMessageTypePolicy(response: unknown): {
    readonly supportedMessageTypes: readonly string[];
    readonly legacyConversions: readonly {
      readonly from: string;
      readonly to: string;
      readonly scope: string;
      readonly reason: string;
    }[];
  } {
    if (!response || typeof response !== "object") {
      throw new Error("RMA_MESSAGE_TYPE_POLICY_INVALID");
    }
    const policy = response as {
      supportedMessageTypes?: unknown;
      legacyConversions?: unknown;
    };
    if (
      !Array.isArray(policy.supportedMessageTypes) ||
      !policy.supportedMessageTypes.every(
        (value) => typeof value === "string",
      ) ||
      !Array.isArray(policy.legacyConversions)
    ) {
      throw new Error("RMA_MESSAGE_TYPE_POLICY_INVALID");
    }
    return policy as {
      readonly supportedMessageTypes: readonly string[];
      readonly legacyConversions: readonly {
        readonly from: string;
        readonly to: string;
        readonly scope: string;
        readonly reason: string;
      }[];
    };
  }

  field(
    records: readonly Record<string, unknown>[],
    field: string,
  ): readonly string[] {
    return [
      ...new Set(
        records
          .map((record) => String(record[field] ?? "").trim())
          .filter(Boolean),
      ),
    ].sort();
  }
}

class PagedBankReferenceReader {
  private readonly http: JsonHttpClient;
  private readonly projection: ReferenceProjectionPolicy;

  constructor(http: JsonHttpClient, projection: ReferenceProjectionPolicy) {
    this.http = http;
    this.projection = projection;
  }

  async readAll(): Promise<readonly Record<string, unknown>[]> {
    const firstPath = "reference/banks?page=1&pageSize=500&query=";
    const first = await this.http.get(firstPath);
    const records = [...this.projection.items(first, firstPath)];
    const totalPages = this.totalPages(first);

    for (let page = 2; page <= totalPages; page += 1) {
      const path = `reference/banks?page=${page}&pageSize=500&query=`;
      records.push(...this.projection.items(await this.http.get(path), path));
    }
    return records;
  }

  private totalPages(response: unknown): number {
    if (!response || typeof response !== "object") return 1;
    const value = Number(
      (response as { totalPages?: unknown }).totalPages ?? 1,
    );
    return Number.isInteger(value) && value > 0 ? value : 1;
  }
}

class ParameterSnapshotIdentityPolicy {
  create(parts: Readonly<Record<string, readonly string[]>>): string {
    const canonical = Object.entries(parts)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, values]) => `${name}\n${[...values].sort().join("\n")}`)
      .join("\n---\n");
    return createHash("sha256").update(canonical).digest("hex").toUpperCase();
  }
}

export class ApiGovernedDataRepository implements GovernedDataRepository {
  private readonly rawPolicy = new RawDomainResponsePolicy();
  private readonly projection = new ReferenceProjectionPolicy();
  private readonly snapshotIdentity = new ParameterSnapshotIdentityPolicy();

  private readonly http: JsonHttpClient;

  constructor(http: JsonHttpClient) {
    this.http = http;
  }

  async loadSnapshot(): Promise<GovernedDataSnapshot> {
    const bankReader = new PagedBankReferenceReader(this.http, this.projection);
    const [
      ssis,
      rmas,
      nostros,
      entities,
      currencies,
      countries,
      banks,
      messageTypePolicy,
    ] = await Promise.all([
      this.http.get("ssis"),
      this.http.get("rma-authorisations"),
      this.http.get("nostro-accounts"),
      this.http.get("booking-branch-entities"),
      this.http.get("reference/currencies"),
      this.http.get("reference/countries"),
      bankReader.readAll(),
      this.http.get("rma-authorisations/message-type-policy"),
    ]);

    const currencyCodes = this.projection.field(
      this.projection.items(currencies, "reference/currencies"),
      "code",
    );
    const countryCodes = this.projection.field(
      this.projection.items(countries, "reference/countries"),
      "code",
    );
    const bankBics = this.projection.field(banks, "bic");
    const rmaPolicy = this.projection.rmaMessageTypePolicy(messageTypePolicy);
    const supportedRmaMessageTypes = rmaPolicy.supportedMessageTypes;

    return {
      ssis: this.rawPolicy.requireArray<SsiRecord>("SSI", ssis),
      rmas: this.rawPolicy.requireArray<RmaRecord>("RMA", rmas),
      nostros: this.rawPolicy.requireArray<NostroRecord>("NOSTRO", nostros),
      entities: this.rawPolicy.requireArray<EntityRecord>("ENTITY", entities),
      reference: {
        currencies: currencyCodes,
        countries: countryCodes,
        bankBics,
        supportedRmaMessageTypes,
        legacyRmaMessageTypeConversions: rmaPolicy.legacyConversions,
        parameterSnapshotId: this.snapshotIdentity.create({
          currencies: currencyCodes,
          countries: countryCodes,
          bankBics,
          supportedRmaMessageTypes,
          legacyRmaMessageTypeConversions: rmaPolicy.legacyConversions.map(
            ({ from, to, scope }) => `${from}|${to}|${scope}`,
          ),
        }),
      },
    };
  }
}
