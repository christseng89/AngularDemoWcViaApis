import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

describe("generic parameter UI architecture", () => {
  it("contains no message-family, scenario, fixture, or field-tag decision table", () => {
    const directory = __dirname;
    const productionSource = readdirSync(directory)
      .filter(
        (file) => /\.(?:ts|html)$/.test(file) && !file.endsWith(".spec.ts"),
      )
      .map((file) => readFileSync(join(directory, file), "utf8"))
      .join("\n");

    expect(productionSource).not.toMatch(/\bMT\d{3}(?:COV)?\b/);
    expect(productionSource).not.toMatch(/pacs\.009/i);
    expect(productionSource).not.toMatch(
      /(?:scenario|fixture)(?:Map|Table|Lookup)/i,
    );
    expect(productionSource).not.toMatch(
      /(?:case|switch)\s+["']?(?:5[23678][A-Z]?|79Z)/,
    );
  });
});
