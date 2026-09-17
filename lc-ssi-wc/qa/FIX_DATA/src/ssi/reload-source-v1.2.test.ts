import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { Round8SsiReloadSourcePreflight } from "./reload-source-v1.2.ts";

test("verifies the approved Round 8 Reload Test Data source", () => {
  const repositoryRoot = resolve(process.cwd());
  const result = new Round8SsiReloadSourcePreflight(repositoryRoot).verify(
    resolve(
      repositoryRoot,
      "qa/FIX_DATA/ssi/reload-test-data-source.v1.2.json",
    ),
  );
  assert.deepEqual(result, {
    sourceId: "SSI-MT1-MT2-DEMO-RELOAD-SOURCE-V1",
    status: "ROUND8_APPLIED_RELOAD_READY",
    fixtureId: "SSI-DEMO-MT1-MT2-PACS008-PACS009-V1",
    seedSha256:
      "F9EBDF0A06CB2F9F269F7A9F0C73C2BDDB568F6E45C9F93C34680422E681F662",
    verifiedArtifacts: 5,
    reloadAuthorized: true,
    databaseWrites: 0,
  });
});
