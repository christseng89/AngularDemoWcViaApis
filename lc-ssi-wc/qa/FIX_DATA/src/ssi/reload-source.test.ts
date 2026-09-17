import assert from "node:assert/strict";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { SsiReloadSourcePreflight } from "./reload-source.ts";

describe("SsiReloadSourcePreflight", () => {
  it("verifies every pinned source while keeping reload disabled", () => {
    const repositoryRoot = resolve(import.meta.dirname, "../../../..");
    const result = new SsiReloadSourcePreflight(repositoryRoot).verify(
      resolve(
        repositoryRoot,
        "qa/FIX_DATA/ssi/reload-test-data-source.v1.1.json",
      ),
    );

    assert.equal(result.sourceId, "SSI-MT347-DEMO-RELOAD-SOURCE-V1.1");
    assert.equal(result.verifiedArtifacts, 7);
    assert.equal(result.reloadAuthorized, false);
    assert.equal(result.databaseWrites, 0);
  });
});
