import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { CanonicalSeedRepository } from "./mt347-reload-preflight.ts";
import { Mt347ReloadSourcePublisher } from "./prepare-mt347-reload-source.ts";

const root = resolve(import.meta.dirname, "../../../..");
const candidate = resolve(
  root,
  "qa/FIX_DATA/ssi/generated/ssi-demo.mt347-oracle-v1.1.mapping-candidate.canonical.seed.json",
);
const applyEvidence = resolve(
  root,
  "qa/FIX_DATA/ssi/generated/ssi-demo.mt347-v1.1.runtime-apply.json",
);

test("publishes the approved development reload source without changing its logical snapshot", () => {
  const output = join(
    mkdtempSync(join(tmpdir(), "ssi-mt347-reload-source-")),
    "approved.seed.json",
  );
  const result = new Mt347ReloadSourcePublisher().publish({
    candidatePath: candidate,
    applyEvidencePath: applyEvidence,
    outputPath: output,
  });
  const repository = new CanonicalSeedRepository();
  const source = repository.load(output);
  const mapped = repository.load(candidate);

  assert.equal(source.fixtureId, "SSI-DEMO-MT347-V1.1-DEVELOPMENT-RELOAD");
  assert.equal(source.classification, "SYNTHETIC_DEMO_QA_UAT");
  assert.equal(source.mappingStatus, "APPROVED_FOR_DEVELOPMENT_RELOAD");
  assert.equal(repository.logicalIdentity(source), repository.logicalIdentity(mapped));
  assert.equal(result.logicalSha256, "d90ef5bfd9c0d59d12fdf8e8a31fcb4271855dce00a4d61eef8cc1d381367867");
});
