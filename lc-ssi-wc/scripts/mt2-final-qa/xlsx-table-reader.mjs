import fs from "node:fs";
import JSZip from "jszip";

const decodeXml = (value) =>
  value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");

const columnIndex = (reference) =>
  [...(/^[A-Z]+/.exec(reference)?.[0] ?? "")].reduce(
    (value, letter) => value * 26 + letter.codePointAt(0) - 64,
    0,
  ) - 1;

export const readFirstWorksheet = async (file) => {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const xml = await zip.file("xl/worksheets/sheet1.xml").async("string");
  const rows = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cellMatch of rowMatch[1].matchAll(
      /<c\b([^>]*)>([\s\S]*?)<\/c>/g,
    )) {
      const reference = /\br="([A-Z]+\d+)"/.exec(cellMatch[1])?.[1];
      if (!reference) continue;
      const textNodes = [
        ...cellMatch[2].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g),
      ].map((match) => match[1]);
      const raw = textNodes.length
        ? textNodes.join("")
        : (/<v>([\s\S]*?)<\/v>/.exec(cellMatch[2])?.[1] ?? "");
      row[columnIndex(reference)] = decodeXml(raw);
    }
    rows.push(row);
  }
  return rows;
};
