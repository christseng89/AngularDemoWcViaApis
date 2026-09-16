import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ApiGovernedDataRepository,
  type JsonHttpClient,
} from "./api-snapshot.repository.ts";

class StubHttpClient implements JsonHttpClient {
  private readonly responses: Readonly<Record<string, unknown>>;

  constructor(responses: Readonly<Record<string, unknown>>) {
    this.responses = responses;
  }

  get(path: string): Promise<unknown> {
    if (!Object.hasOwn(this.responses, path)) {
      return Promise.reject(new Error(`UNEXPECTED_GET:${path}`));
    }
    return Promise.resolve(this.responses[path]);
  }
}

describe("ApiGovernedDataRepository", () => {
  it("loads four raw domains and governed references using GET only", async () => {
    const repository = new ApiGovernedDataRepository(
      new StubHttpClient({
        "settings/runtime": {
          currentSnapshot: {
            sha256: "A".repeat(64),
            method: "SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1",
          },
        },
        ssis: [],
        "rma-authorisations": [],
        "nostro-accounts": [],
        "booking-branch-entities": [],
        "reference/currencies": [{ code: "USD" }],
        "reference/countries": [{ code: "HK" }],
        "reference/banks?page=1&pageSize=500&query=": {
          items: [{ bic: "CITIUS33" }],
          totalPages: 1,
        },
        "rma-authorisations/message-type-policy": {
          supportedMessageTypes: ["MT103", "pacs.008.001.08"],
          legacyConversions: [
            {
              from: "pacs.008.001.12",
              to: "pacs.008.001.08",
              scope: "OPERATIONAL_OR_DRAFT_POSITIVE_DATA",
              reason:
                "Legacy generic ISO 20022 value is replaced by the governed CBPR+ SSI profile.",
            },
          ],
          developmentReferenceGapSkips: [],
        },
      }),
    );

    const snapshot = await repository.loadSnapshot();

    assert.deepEqual(snapshot.reference.currencies, ["USD"]);
    assert.deepEqual(snapshot.reference.countries, ["HK"]);
    assert.deepEqual(snapshot.reference.bankBics, ["CITIUS33"]);
    assert.deepEqual(snapshot.reference.supportedRmaMessageTypes, [
      "MT103",
      "pacs.008.001.08",
    ]);
    assert.deepEqual(snapshot.reference.legacyRmaMessageTypeConversions, [
      {
        from: "pacs.008.001.12",
        to: "pacs.008.001.08",
        scope: "OPERATIONAL_OR_DRAFT_POSITIVE_DATA",
        reason:
          "Legacy generic ISO 20022 value is replaced by the governed CBPR+ SSI profile.",
      },
    ]);
    assert.match(snapshot.reference.parameterSnapshotId, /^[A-F0-9]{64}$/);
    assert.equal(snapshot.acquisition.databaseBefore.sha256, "A".repeat(64));
    assert.equal(snapshot.acquisition.databaseAfter.sha256, "A".repeat(64));
  });

  it("fails closed when a governed domain returns a grouped page", async () => {
    const repository = new ApiGovernedDataRepository(
      new StubHttpClient({
        "settings/runtime": {
          currentSnapshot: {
            sha256: "B".repeat(64),
            method: "SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1",
          },
        },
        ssis: { items: [] },
        "rma-authorisations": [],
        "nostro-accounts": [],
        "booking-branch-entities": [],
        "reference/currencies": [],
        "reference/countries": [],
        "reference/banks?page=1&pageSize=500&query=": {
          items: [],
          totalPages: 1,
        },
        "rma-authorisations/message-type-policy": {
          supportedMessageTypes: [],
          legacyConversions: [],
          developmentReferenceGapSkips: [],
        },
      }),
    );

    await assert.rejects(
      repository.loadSnapshot(),
      /RAW_DOMAIN_RESPONSE_REQUIRED:SSI/,
    );
  });
});
