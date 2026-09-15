"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashCanonical = exports.canonicalJson = void 0;
const node_crypto_1 = require("node:crypto");
const encode = (value, ancestors) => {
    if (value === null)
        return "null";
    if (typeof value === "string" || typeof value === "boolean")
        return JSON.stringify(value);
    if (typeof value === "number") {
        if (!Number.isFinite(value))
            throw new TypeError("UNSUPPORTED_CANONICAL_VALUE");
        return JSON.stringify(value);
    }
    if (typeof value !== "object")
        throw new TypeError("UNSUPPORTED_CANONICAL_VALUE");
    if (ancestors.has(value))
        throw new TypeError("CYCLIC_CANONICAL_VALUE");
    ancestors.add(value);
    try {
        if (Array.isArray(value))
            return `[${value.map((item) => encode(item, ancestors)).join(",")}]`;
        if (Object.getPrototypeOf(value) !== Object.prototype)
            throw new TypeError("UNSUPPORTED_CANONICAL_VALUE");
        const object = value;
        return `{${Object.keys(object)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${encode(object[key], ancestors)}`)
            .join(",")}}`;
    }
    finally {
        ancestors.delete(value);
    }
};
const canonicalJson = (value) => encode(value, new Set());
exports.canonicalJson = canonicalJson;
const hashCanonical = (value) => (0, node_crypto_1.createHash)("sha256").update((0, exports.canonicalJson)(value)).digest("hex");
exports.hashCanonical = hashCanonical;
//# sourceMappingURL=canonical-json.js.map