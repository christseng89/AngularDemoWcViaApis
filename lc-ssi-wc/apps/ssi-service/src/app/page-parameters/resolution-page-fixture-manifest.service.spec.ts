import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BadRequestException } from "@nestjs/common";
import { ResolutionPageFixtureManifestService } from "./resolution-page-fixture-manifest.service";

describe("ResolutionPageFixtureManifestService", () => {
  it("loads and merges governed bindings from additional manifests", () => {
    const directory = join(process.cwd(), "tmp", "fixture-manifest-spec");
    const primary = join(directory, "primary.json");
    const payment = join(directory, "payment.json");
    const binding = (bindingId: string) => ({
      bindingId,
      fixtureSet: "CONTROLLED",
      fixtureVersion: "v1",
      sourceFile: "parameters/source.json",
      sourceFileSha256: "a".repeat(64),
      polarity: "POSITIVE",
    });
    mkdirSync(directory, { recursive: true });
    writeFileSync(primary, JSON.stringify({ bindings: [binding("A")] }));
    writeFileSync(payment, JSON.stringify({ bindings: [binding("B")] }));

    const service = new ResolutionPageFixtureManifestService({
      path: primary,
      additionalPaths: [payment],
    });

    expect(service.count()).toBe(2);
    expect(service.require("B").fixtureVersion).toBe("v1");
  });

  it("rejects duplicate binding identities across manifests", () => {
    const directory = join(
      process.cwd(),
      "tmp",
      "fixture-manifest-duplicate-spec",
    );
    const primary = join(directory, "primary.json");
    const payment = join(directory, "payment.json");
    const binding = {
      bindingId: "DUPLICATE",
      fixtureSet: "CONTROLLED",
      fixtureVersion: "v1",
      sourceFile: "parameters/source.json",
      sourceFileSha256: "b".repeat(64),
      polarity: "POSITIVE",
    };
    mkdirSync(directory, { recursive: true });
    writeFileSync(primary, JSON.stringify({ bindings: [binding] }));
    writeFileSync(payment, JSON.stringify({ bindings: [binding] }));

    try {
      new ResolutionPageFixtureManifestService({
        path: primary,
        additionalPaths: [payment],
      });
      throw new Error("expected duplicate binding rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: "PAGE_FIXTURE_MANIFEST_INVALID",
      });
    }
  });
});
