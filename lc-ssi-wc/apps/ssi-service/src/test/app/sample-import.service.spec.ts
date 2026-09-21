import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { SampleImportService, type PseudoSwiftSample } from "../../app/sample-import.service";

describe("SampleImportService", () => {
  const originalRoot = process.env["SAMPLE_ROOT"];
  let root: string;
  const mapping = {
    parse: jest.fn((content: string, format: string) => ({ content, format })),
    extract: jest.fn((parsed: unknown) => ({ parsed })),
  };

  beforeEach(() => {
    root = mkdtempSync(join(process.cwd(), "tmp", "sample-import-"));
    mkdirSync(join(root, "nested"), { recursive: true });
    writeFileSync(join(root, "nested", "payment.ssi"), "MT202 sample", "utf8");
    writeFileSync(join(root, "payment.json"), '{"messageType":"pacs.009"}', "utf8");
    writeFileSync(join(root, "ignored.txt"), "ignored", "utf8");
    process.env["SAMPLE_ROOT"] = root;
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (originalRoot === undefined) delete process.env["SAMPLE_ROOT"];
    else process.env["SAMPLE_ROOT"] = originalRoot;
    rmSync(root, { recursive: true, force: true });
  });

  it("lists only governed sample extensions and identifies both formats", () => {
    const service = new SampleImportService(mapping as never);

    expect(service.list()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "nested/payment.ssi", format: "FIN_LIKE", bytes: 12 }),
        expect.objectContaining({ path: "payment.json", format: "MX_JSON" }),
      ]),
    );
  });

  it.each([
    ["nested/payment.ssi", "FIN_LIKE"],
    ["payment.json", "MX_JSON"],
  ] as const)("loads and extracts %s as %s", (path, format) => {
    const service = new SampleImportService(mapping as never);
    const result = service.load(path);

    expect(result.sample).toEqual(expect.objectContaining({ path, format }));
    expect(mapping.parse).toHaveBeenCalledWith(result.content, format);
    expect(mapping.extract).toHaveBeenCalledWith(expect.objectContaining({ format }));
  });

  it.each(["", "../outside.ssi", "bad path.ssi", "ignored.txt"])(
    "rejects unsafe sample path %s",
    (path) => {
      const service = new SampleImportService(mapping as never);
      expect(() => service.load(path)).toThrow(BadRequestException);
    },
  );

  it("rejects missing and oversized sample files", () => {
    const service = new SampleImportService(mapping as never);
    expect(() => service.load("missing.ssi")).toThrow(NotFoundException);
    writeFileSync(join(root, "large.ssi"), "x".repeat(64 * 1024 + 1), "utf8");
    expect(() => service.load("large.ssi")).toThrow("SAMPLE_FILE_TOO_LARGE");
  });

  it("summarises imported and failed directory entries without aborting the batch", () => {
    const service = new SampleImportService(mapping as never);
    const samples: readonly PseudoSwiftSample[] = [
      { path: "good.ssi", format: "FIN_LIKE", bytes: 1 },
      { path: "bad.ssi", format: "FIN_LIKE", bytes: 1 },
      { path: "unknown.ssi", format: "FIN_LIKE", bytes: 1 },
    ];
    jest.spyOn(service, "list").mockReturnValue(samples);
    jest.spyOn(service, "load").mockImplementation((path) => {
      if (path === "bad.ssi") throw new Error("invalid message");
      if (path === "unknown.ssi") throw "untyped failure";
      return {
        sample: samples[0]!,
        content: "sample",
        extraction: { ok: true },
      };
    });

    const result = service.importDirectory();
    expect(result).toMatchObject({ rootAlias: "SAMPLE_ROOT", imported: 1, failed: 2 });
    expect(result.results).toEqual([
      expect.objectContaining({ status: "IMPORTED" }),
      expect.objectContaining({ status: "FAILED", error: "invalid message" }),
      expect.objectContaining({ status: "FAILED", error: "IMPORT_FAILED" }),
    ]);
  });

  it("uses the repository samples directory when no override is configured", () => {
    delete process.env["SAMPLE_ROOT"];
    const service = new SampleImportService(mapping as never);
    expect(service.list().length).toBeGreaterThan(0);
  });
});
