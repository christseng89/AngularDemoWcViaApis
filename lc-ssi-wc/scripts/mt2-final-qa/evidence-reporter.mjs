import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const writeEvidence = (directory, report) => {
  fs.mkdirSync(directory, { recursive: true });
  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    ...report,
  };
  const reportPath = path.join(directory, "mt2-final-qa-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2));
  const sha256 = crypto
    .createHash("sha256")
    .update(fs.readFileSync(reportPath))
    .digest("hex")
    .toUpperCase();
  const manifestPath = path.join(directory, "manifest.sha256.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({ file: path.basename(reportPath), sha256 }, null, 2),
  );
  return { reportPath, manifestPath, sha256 };
};
