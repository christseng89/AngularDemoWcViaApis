import { scalarText } from "../../lib/scalar-text";

describe("scalarText", () => {
  it("renders primitives and rejects implicit object stringification", () => {
    expect(scalarText("value")).toBe("value");
    expect(scalarText(42)).toBe("42");
    expect(scalarText(false)).toBe("false");
    expect(scalarText({ value: "unsafe" }, "fallback")).toBe("fallback");
  });
});
