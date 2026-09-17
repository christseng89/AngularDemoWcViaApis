import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  DeterministicJsonFileWriter,
  Sha256FileIdentity,
} from "./artifact-io.ts";

describe("shared artifact IO", () => {
  it("writes deterministic JSON with a matching SHA sidecar", () => {
    const directory = mkdtempSync(join(tmpdir(), "artifact-io-"));
    const output = join(directory, "artifact.json");
    const identity = new DeterministicJsonFileWriter(
      new Sha256FileIdentity(),
    ).write(output, { answer: 42 });

    assert.equal(identity.sha256, new Sha256FileIdentity().ofFile(output));
    assert.equal(readFileSync(output, "utf8"), '{\n  "answer": 42\n}\n');
    assert.match(
      readFileSync(`${output}.sha256`, "utf8"),
      new RegExp(`^${identity.sha256}  artifact\\.json\\n$`),
    );
  });
});
