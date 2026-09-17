import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  SsiMt1Mt2DemoApplier,
  ssiDemoLogicalIdentity,
} from "./mt1-mt2-demo-apply.ts";
import { SsiMt1Mt2CandidateGenerator } from "./mt1-mt2-candidate-generator.ts";

test("applies the Demo overlay twice without duplicates or unrelated changes", async () => {
  const directory = mkdtempSync(join(tmpdir(), "ssi-mt12-demo-"));
  const databasePath = join(directory, "ssi.sqlite");
  const source = new DatabaseSync(
    "qa/_ARCHIVE/ssi/ssi-demo.pre-round7-apply.sqlite",
    { readOnly: true },
  );
  try {
    await backup(source, databasePath);
  } finally {
    source.close();
  }
  try {
    const report = await new SsiMt1Mt2DemoApplier(
      databasePath,
      "qa/FIX_DATA/ssi/mt1-mt2/repair-rule-table.v1.json",
    ).apply(join(directory, "before.sqlite"));
    assert.equal(report.status, "PASS");
    assert.deepEqual(report.firstApply, {
      ssiInserts: 49,
      applicabilityInserts: 128,
    });
    assert.deepEqual(report.secondApply, {
      ssiInserts: 0,
      applicabilityInserts: 0,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("restores the verified backup after a committed first-apply count mismatch", async () => {
  const directory = mkdtempSync(join(tmpdir(), "ssi-mt12-restore-"));
  const databasePath = join(directory, "ssi.sqlite");
  const source = new DatabaseSync(
    "qa/_ARCHIVE/ssi/ssi-demo.pre-round7-apply.sqlite",
    { readOnly: true },
  );
  try {
    await backup(source, databasePath);
  } finally {
    source.close();
  }
  try {
    const ruleTable = "qa/FIX_DATA/ssi/mt1-mt2/repair-rule-table.v1.json";
    const first = new SsiMt1Mt2CandidateGenerator(
      databasePath,
      ruleTable,
    ).generate().ssi[0];
    const db = new DatabaseSync(databasePath);
    try {
      db.prepare("INSERT INTO ssi(id,payload,updated_at) VALUES(?,?,?)").run(
        first.id,
        JSON.stringify(first.payload),
        String(first.payload.updatedAt),
      );
    } finally {
      db.close();
    }
    const before = ssiDemoLogicalIdentity(databasePath);
    await assert.rejects(
      new SsiMt1Mt2DemoApplier(databasePath, ruleTable).apply(
        join(directory, "before.sqlite"),
      ),
      /DEMO_APPLY_FIRST_APPLY_COUNT_MISMATCH/,
    );
    assert.equal(ssiDemoLogicalIdentity(databasePath), before);
    const restored = new DatabaseSync(databasePath, { readOnly: true });
    try {
      assert.equal(
        Number(
          Object.values(
            restored
              .prepare("SELECT COUNT(*) FROM ssi WHERE id LIKE 'SSI-MT12-V1-%'")
              .get() as Record<string, unknown>,
          )[0],
        ),
        1,
      );
      assert.equal(
        Number(
          Object.values(
            restored
              .prepare(
                "SELECT COUNT(*) FROM ssi_applicability WHERE id LIKE 'SSI-MT12-V1-%'",
              )
              .get() as Record<string, unknown>,
          )[0],
        ),
        0,
      );
    } finally {
      restored.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
