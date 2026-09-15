import { createHash } from "node:crypto";

const encode = (value: unknown, ancestors: Set<object>): string => {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new TypeError("UNSUPPORTED_CANONICAL_VALUE");
    return JSON.stringify(value);
  }
  if (typeof value !== "object")
    throw new TypeError("UNSUPPORTED_CANONICAL_VALUE");
  if (ancestors.has(value)) throw new TypeError("CYCLIC_CANONICAL_VALUE");

  ancestors.add(value);
  try {
    if (Array.isArray(value))
      return `[${value.map((item) => encode(item, ancestors)).join(",")}]`;
    if (Object.getPrototypeOf(value) !== Object.prototype)
      throw new TypeError("UNSUPPORTED_CANONICAL_VALUE");
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => `${JSON.stringify(key)}:${encode(object[key], ancestors)}`)
      .join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
};

export const canonicalJson = (value: unknown): string =>
  encode(value, new Set());

export const hashCanonical = (value: unknown): string =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");
