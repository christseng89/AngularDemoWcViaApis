import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Phase 9B Root ownership boundary", () => {
  const root = readFileSync(join(join(process.cwd(), "apps/ssi-portal/src/app"), "app.component.ts"), "utf8");
  const matchingLines = (patterns: readonly RegExp[]) =>
    root
      .split(/\r?\n/)
      .map((text, index) => ({ line: index + 1, text }))
      .filter(({ text }) => patterns.some((pattern) => pattern.test(text)));

  it("does not construct Payment or FIN HTTP services or own their business state", () => {
    expect(
      matchingLines([
        /PaymentSettlementApiService/,
        /FinResolutionApiService/,
        /SSI_RESOLUTION_READ_PORT/,
        /readonly paymentMessageIndex\s*=/,
        /readonly finResolutionCatalogue\s*=/,
        /readonly resolutionResult\s*=/,
        /readonly generationResult\s*=/,
      ]),
    ).toEqual([]);
  });

  it("does not expose legacy Payment or FIN command orchestration", () => {
    expect(
      matchingLines([
        /\bloadPaymentMessageIndex\s*\(/,
        /\benterFinResolution\s*\(/,
        /\bconfirmResolution\s*\(/,
        /\bgenerateTags\s*\(/,
        /\bensureTagSsiSelection\s*\(/,
      ]),
    ).toEqual([]);
  });
});
