import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("qa-archived");
const manifestFile = path.join(root, "archive-manifest.json");
const walk = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
const originalPath = (archivePath) => {
  const relative = path.relative(root, archivePath).replaceAll("\\", "/");
  if (relative.startsWith("mt2/superseded-active/"))
    return relative
      .slice("mt2/superseded-active/".length)
      .replace(/^qa__/, "qa/")
      .replace(/^scripts__/, "scripts/")
      .replaceAll("__", "/");
  if (relative.startsWith("mt2/")) return `qa/fixtures/${relative}`;
  return `qa/${relative}`;
};

const files = walk(root)
  .filter((file) => file !== manifestFile)
  .sort()
  .map((file) => ({
    originalPath: originalPath(file),
    archivePath: path.relative(process.cwd(), file).replaceAll("\\", "/"),
    sha256: crypto
      .createHash("sha256")
      .update(fs.readFileSync(file))
      .digest("hex")
      .toUpperCase(),
    status: "SUPERSEDED_ARCHIVED",
    reason:
      "Replaced by the approved Outward SSI Resolve Only Proposal and active data/qa evidence.",
  }));

fs.writeFileSync(
  manifestFile,
  `${JSON.stringify({ schemaVersion: 1, archivedOn: "2026-09-25", files }, null, 2)}\n`,
);
