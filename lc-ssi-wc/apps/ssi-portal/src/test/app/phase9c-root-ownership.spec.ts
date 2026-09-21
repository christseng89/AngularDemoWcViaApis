import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Phase 9C Root shell ownership", () => {
  const root = readFileSync(join(join(process.cwd(), "apps/ssi-portal/src/app"), "app.component.ts"), "utf8");

  it("does not maintain a second feature data cache after lazy route ownership", () => {
    expect(root).not.toMatch(/\bloadedFeatureData\b/);
    expect(root).not.toMatch(/\bfeatureDataLoads\b/);
    expect(root).not.toMatch(/\bfeatureDataGeneration\b/);
    expect(root).not.toMatch(/\bensureFeatureData\s*\(/);
    expect(root).not.toMatch(/\bloadFeatureData\s*\(/);
  });

  it("does not own shared SSI detail fetching or Checker decision state", () => {
    expect(root).not.toMatch(/\bReferenceLookupApiService\b/);
    expect(root).not.toMatch(/\bfirstValueFrom\b/);
    expect(root).not.toMatch(/\bdetailTarget\s*=\s*signal\s*\(/);
    expect(root).not.toMatch(/\bcheckerRejectReason\s*=\s*signal\s*\(/);
    expect(root).not.toMatch(/\bdecideSsi\s*\(/);
    expect(root).not.toMatch(/\bloadCurrencies\s*\(/);
  });

});
