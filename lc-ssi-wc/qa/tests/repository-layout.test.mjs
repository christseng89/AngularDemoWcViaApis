import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const workspace = path.resolve(import.meta.dirname, "../..");
const approvedQaEntries = ["README.md", "reports", "tdd", "tests"];
const legacyQaReference =
  /FIX_DATA|qa-archived(?:\/|\\)|(?:^|["'\s])qa\/(?:docker|mt1|mt2|mt347|ssi-[^/]+|test_cases)(?:\/|\b)/gm;
const referenceRoots = [
  "package.json",
  "apps",
  "libs",
  "scripts",
  "parameters",
  "openapi",
  "data/qa",
  "qa/reports/latest",
];
const archiveManagementFiles = new Set([
  "scripts/build-qa-archive-manifest.mjs",
]);
const textExtensions = new Set([
  ".cjs",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".py",
  ".sh",
  ".ts",
  ".yaml",
  ".yml",
]);

const walk = (target) => {
  if (!fs.existsSync(target)) return [];
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  return fs
    .readdirSync(target, { withFileTypes: true })
    .flatMap((entry) => walk(path.join(target, entry.name)));
};

test("the QA working tree contains only the approved top-level layout", () => {
  const entries = fs.readdirSync(path.resolve(workspace, "qa")).sort();
  assert.deepEqual(entries, approvedQaEntries);
  const reportEntries = fs
    .readdirSync(path.resolve(workspace, "qa/reports"))
    .sort();
  assert.deepEqual(reportEntries, ["latest"]);
});

test("active source and configuration do not reference legacy QA paths", () => {
  const violations = referenceRoots
    .flatMap((root) => walk(path.resolve(workspace, root)))
    .filter((file) => textExtensions.has(path.extname(file)))
    .filter(
      (file) =>
        !archiveManagementFiles.has(
          path.relative(workspace, file).replaceAll(path.sep, "/"),
        ),
    )
    .flatMap((file) => {
      const content = fs.readFileSync(file, "utf8");
      return [...content.matchAll(legacyQaReference)].map((match) => ({
        file: path.relative(workspace, file).replaceAll(path.sep, "/"),
        reference: match[0],
      }));
    });
  assert.deepEqual(violations, []);
});

test("BA QA DBA active review inputs are isolated from the archive", () => {
  const reviewRoots = ["data/qa", "qa/reports/latest"];
  const violations = reviewRoots
    .flatMap((root) => walk(path.resolve(workspace, root)))
    .filter((file) => textExtensions.has(path.extname(file)))
    .flatMap((file) => {
      const content = fs.readFileSync(file, "utf8");
      return [...content.matchAll(/qa-archived(?:\/|\\)/g)].map((match) => ({
        file: path.relative(workspace, file).replaceAll(path.sep, "/"),
        reference: match[0],
      }));
    });
  assert.deepEqual(violations, []);
});
