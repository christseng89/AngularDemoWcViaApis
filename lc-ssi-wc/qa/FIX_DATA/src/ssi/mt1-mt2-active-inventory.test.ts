import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  ActiveMessageInventoryRepository,
  InventoryReportWriter,
  MessageFamilyClassifier,
} from "./mt1-mt2-active-inventory.ts";

const root = process.cwd();
const databasePath = resolve(root, "data/ssi-demo.sqlite");
const reloadSeedPath = resolve(
  root,
  "qa/FIX_DATA/ssi/reload-test-data/ssi-demo.mt1-mt2.v1.approved.canonical.seed.json",
);

const fileSha = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex").toUpperCase();

test("reads current ACTIVE MT/MX inventory without changing the runtime database", () => {
  const before = { sha: fileSha(databasePath), mtime: statSync(databasePath).mtimeMs };
  const snapshot = new ActiveMessageInventoryRepository(
    databasePath,
    reloadSeedPath,
  ).read();
  const report = new MessageFamilyClassifier().classify(snapshot);
  const after = { sha: fileSha(databasePath), mtime: statSync(databasePath).mtimeMs };

  assert.deepEqual(after, before);
  assert.deepEqual(report.activeMemberships, {
    ssi: {
      "pacs.008.001.12": 24,
      "pacs.008.001.012": 0,
      "pacs.008.001.08": 0,
      "pacs.009.001.12": 43,
      "pacs.009.001.012": 0,
      "pacs.009.001.08": 68,
    },
    rma: {
      "pacs.008.001.12": 2,
      "pacs.008.001.012": 0,
      "pacs.008.001.08": 28,
      "pacs.009.001.12": 2,
      "pacs.009.001.012": 0,
      "pacs.009.001.08": 40,
      MT1: 8,
      MT2: 14,
    },
  });
  assert.equal(report.pacs009DualTokenActiveSsi, 32);
  assert.equal(report.pacs009SourceOnlyActiveSsi, 11);
  assert.equal(report.rmaResidual.physicalRows, 2);
  assert.equal(report.rmaResidual.sourceTokenMemberships, 4);
  assert.equal(report.rmaResidual.canonicalGroups, 2);
});

test("exports exact runtime-only preservation evidence", () => {
  const snapshot = new ActiveMessageInventoryRepository(
    databasePath,
    reloadSeedPath,
  ).read();
  const report = new MessageFamilyClassifier().classify(snapshot);

  assert.equal(report.runtimeOnly.ssi.length, 0);
  assert.equal(report.runtimeOnly.applicability.length, 0);
  assert.match(report.runtimeOnly.logicalSha256, /^[A-F0-9]{64}$/);
  assert.equal(report.databaseWrites, 0);
  assert.equal(report.unknownDisposition, 0);
});

test("writes stable canonical JSON without writing to the database", () => {
  const snapshot = new ActiveMessageInventoryRepository(
    databasePath,
    reloadSeedPath,
  ).read();
  const report = new MessageFamilyClassifier().classify(snapshot);
  const writer = new InventoryReportWriter();

  assert.equal(writer.serialize(report), writer.serialize(report));
  assert.equal(JSON.parse(writer.serialize(report)).databaseWrites, 0);
});
