import { canonicalJson, hashCanonical } from "./canonical-json";

describe("canonical JSON", () => {
  it("sorts object keys recursively while preserving array order", () => {
    const left = { z: [2, 1], a: { y: true, x: "value" } };
    const right = { a: { x: "value", y: true }, z: [2, 1] };
    expect(canonicalJson(left)).toBe(canonicalJson(right));
    expect(hashCanonical(left)).toBe(hashCanonical(right));
    expect(hashCanonical({ z: [1, 2], a: left.a })).not.toBe(hashCanonical(left));
  });

  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY, () => undefined])(
    "rejects unsupported value %p",
    (value) => expect(() => canonicalJson({ value })).toThrow("UNSUPPORTED_CANONICAL_VALUE"),
  );

  it("rejects cyclic objects", () => {
    const value: Record<string, unknown> = {};
    value["self"] = value;
    expect(() => canonicalJson(value)).toThrow("CYCLIC_CANONICAL_VALUE");
  });
});
