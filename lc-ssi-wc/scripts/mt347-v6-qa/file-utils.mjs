import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const sha256File = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

export const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

export const listFiles = (root, extensions) => {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) return listFiles(target, extensions);
    return extensions.has(path.extname(entry.name)) ? [target] : [];
  });
};

export const normalizePath = (file) => file.split(path.sep).join("/");

export const stableJson = (value) => {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableJson(child)]),
    );
  return value;
};

export const stableJsonText = (value) =>
  `${JSON.stringify(stableJson(value), null, 2)}\n`;
