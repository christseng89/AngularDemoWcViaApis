import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import JSZip from "jszip";

import { readFirstWorksheet } from "./xlsx-table-reader.mjs";

const require = createRequire(import.meta.url);
let docx;
try {
  docx = require("docx");
} catch (error) {
  throw new Error(
    "The docx package is required. Run with NODE_PATH pointing to the bundled workspace node_modules.",
    { cause: error },
  );
}

const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
} = docx;

const here = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(here, "../..");
const workbook = path.resolve(
  workspace,
  "qa/fixtures/mt2/MT2XX_測試案例_SSI與NOSTRO_v6.2_FINAL.xlsx",
);
const output = path.resolve(
  workspace,
  "qa/reports/latest/mt2/MT2XX_139測試案例_訊息輸入與預期輸出.docx",
);
const validationOutput = path.resolve(
  workspace,
  "qa/reports/latest/mt2/MT2XX_139測試案例_文件驗證.json",
);

const endpointConfig = JSON.parse(
  fs.readFileSync(path.resolve(workspace, "qa/tests/mt2/final/case-endpoints.json")),
);
const adapterRegistry = JSON.parse(
  fs.readFileSync(
    path.resolve(workspace, "qa/tests/mt2/final/message-adapter-registry.json"),
  ),
);

const EXPECTED_HEADERS = [
  "Test Case No.",
  "Message Type",
  "Input",
  "MX expected Output",
  "MT expected Output",
];

const sha256 = (value) =>
  crypto.createHash("sha256").update(value).digest("hex").toUpperCase();

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

const validatedCaseRows = (rows) => {
  if (JSON.stringify(rows[0]) !== JSON.stringify(EXPECTED_HEADERS)) {
    throw new Error(`Unexpected workbook headers: ${JSON.stringify(rows[0])}`);
  }
  const cases = rows.slice(1).filter((row) => row[0]);
  if (cases.length !== 139) {
    throw new Error(`Expected 139 workbook rows, found ${cases.length}`);
  }
  const ids = cases.map((row) => row[0]);
  if (new Set(ids).size !== 139) {
    throw new Error("Workbook Test Case No. values are not unique");
  }
  return cases;
};

const messageDomain = (messageType, inputObject, mxObject, mtObject) => {
  const declared = inputObject["request/context"]?.domain;
  if (declared) return declared;
  const redirected = mxObject.redirectDomain || mtObject.redirectDomain;
  if (redirected) return redirected;
  const unsupported =
    mxObject.code === "MESSAGE_TYPE_NOT_SUPPORTED" ||
    mtObject.code === "MESSAGE_TYPE_NOT_SUPPORTED";
  if (unsupported) return "MESSAGE_TYPE_CONTRACT";
  return adapterRegistry.messageTypes[messageType] ?? "";
};

const endpointForDomain = (domain) => {
  const endpointPath = endpointConfig.domains[domain] ?? "";
  if (!endpointPath) return "";
  return `${endpointConfig.baseUrl.replace(/\/$/, "")}${endpointPath}`;
};

const presentCase = ([caseNo, messageType, input, mx, mt]) => {
  const inputObject = JSON.parse(input);
  const mxObject = JSON.parse(mx);
  const mtObject = JSON.parse(mt);
  const domain = messageDomain(messageType, inputObject, mxObject, mtObject);
  return {
    caseNo,
    messageType,
    input,
    mx,
    mt,
    domain,
    endpoint: endpointForDomain(domain),
    expectedStatus: mxObject.httpStatus ?? mtObject.httpStatus ?? null,
  };
};

const loadCases = async () => {
  const rows = await readFirstWorksheet(workbook);
  return validatedCaseRows(rows).map(presentCase);
};

const font = {
  ascii: "Arial",
  hAnsi: "Arial",
  eastAsia: "Microsoft JhengHei",
};
const monoFont = {
  ascii: "Consolas",
  hAnsi: "Consolas",
  eastAsia: "Microsoft JhengHei",
};
const navy = "17365D";
const teal = "0F6B78";
const paleBlue = "DCE6F1";
const paleGray = "F5F7FA";
const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: "C9D2DE" };

const labelCell = (text, width) =>
  new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { fill: paleBlue, type: ShadingType.CLEAR },
    margins: { top: 90, bottom: 90, left: 110, right: 110 },
    borders: {
      top: cellBorder,
      bottom: cellBorder,
      left: cellBorder,
      right: cellBorder,
    },
    children: [
      new Paragraph({
        spacing: { before: 0, after: 0 },
        children: [
          new TextRun({ text, bold: true, color: navy, font, size: 17 }),
        ],
      }),
    ],
  });

const valueCell = (text, width) =>
  new TableCell({
    width: { size: width, type: WidthType.DXA },
    margins: { top: 90, bottom: 90, left: 110, right: 110 },
    borders: {
      top: cellBorder,
      bottom: cellBorder,
      left: cellBorder,
      right: cellBorder,
    },
    children: [
      new Paragraph({
        spacing: { before: 0, after: 0 },
        children: [new TextRun({ text: String(text || "—"), font, size: 17 })],
      }),
    ],
  });

const metadataTable = (item) => {
  const widths = [1500, 2950, 1500, 2950];
  return new Table({
    width: { size: 8900, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({
        children: [
          labelCell("Test Case No.", widths[0]),
          valueCell(item.caseNo, widths[1]),
          labelCell("Message Type", widths[2]),
          valueCell(item.messageType, widths[3]),
        ],
      }),
      new TableRow({
        children: [
          labelCell("Domain", widths[0]),
          valueCell(item.domain, widths[1]),
          labelCell("Expected HTTP", widths[2]),
          valueCell(item.expectedStatus ?? "未指定", widths[3]),
        ],
      }),
      new TableRow({
        children: [
          labelCell("Endpoint", widths[0]),
          new TableCell({
            width: {
              size: widths[1] + widths[2] + widths[3],
              type: WidthType.DXA,
            },
            columnSpan: 3,
            margins: { top: 90, bottom: 90, left: 110, right: 110 },
            borders: {
              top: cellBorder,
              bottom: cellBorder,
              left: cellBorder,
              right: cellBorder,
            },
            children: [
              new Paragraph({
                spacing: { before: 0, after: 0 },
                children: [
                  new TextRun({ text: item.endpoint || "—", font, size: 17 }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
};

const jsonParagraph = (value) =>
  new Paragraph({
    spacing: { before: 0, after: 90, line: 190 },
    shading: { fill: paleGray, type: ShadingType.CLEAR },
    border: {
      top: cellBorder,
      bottom: cellBorder,
      left: cellBorder,
      right: cellBorder,
    },
    indent: { left: 120, right: 120 },
    children: value.split("\n").map(
      (line, index) =>
        new TextRun({
          text: line,
          break: index === 0 ? 0 : 1,
          font: monoFont,
          size: 15,
          color: "263238",
        }),
    ),
  });

const caseSection = (item, firstCase) => [
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    pageBreakBefore: !firstCase,
    keepNext: true,
    children: [
      new TextRun({ text: `${item.caseNo} — ${item.messageType}`, font }),
    ],
  }),
  metadataTable(item),
  new Paragraph({
    heading: HeadingLevel.HEADING_3,
    keepNext: true,
    children: [new TextRun({ text: "輸入（Input）", font })],
  }),
  jsonParagraph(item.input),
  new Paragraph({
    heading: HeadingLevel.HEADING_3,
    keepNext: true,
    children: [new TextRun({ text: "MX 預期輸出", font })],
  }),
  jsonParagraph(item.mx),
  new Paragraph({
    heading: HeadingLevel.HEADING_3,
    keepNext: true,
    children: [new TextRun({ text: "MT 預期輸出", font })],
  }),
  jsonParagraph(item.mt),
];

const makeDocument = (cases, workbookHash) => {
  const counts = Object.entries(
    cases.reduce((result, item) => {
      result[item.messageType] = (result[item.messageType] ?? 0) + 1;
      return result;
    }, {}),
  );
  const content = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 2200, after: 260 },
      children: [
        new TextRun({
          text: "MT2XX 139 測試案例",
          bold: true,
          color: navy,
          size: 42,
          font,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 320 },
      children: [
        new TextRun({
          text: "Messages Input and Expected Output",
          color: teal,
          size: 26,
          font,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 180 },
      children: [
        new TextRun({
          text: "QA / 工程共同執行版",
          bold: true,
          size: 22,
          font,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({ text: `案例總數：${cases.length}`, font, size: 20 }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: `來源 SHA-256：${workbookHash}`,
          font: monoFont,
          size: 14,
          color: "555555",
        }),
      ],
    }),
    new Paragraph({
      pageBreakBefore: true,
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: "文件說明", font })],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "本文件由凍結版 Excel 測試案例自動產生。Input、MX expected Output 與 MT expected Output 逐字取自來源 workbook；Domain、Endpoint 與 Expected HTTP 依同一套 QA adapter 規則推導。",
          font,
        }),
      ],
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: "案例分布", font })],
    }),
    new Table({
      width: { size: 5000, type: WidthType.DXA },
      columnWidths: [3500, 1500],
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            labelCell("Message Type", 3500),
            labelCell("案例數", 1500),
          ],
        }),
        ...counts.map(
          ([messageType, count]) =>
            new TableRow({
              children: [valueCell(messageType, 3500), valueCell(count, 1500)],
            }),
        ),
      ],
    }),
    new Paragraph({
      pageBreakBefore: true,
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: "目錄", font })],
    }),
    new TableOfContents("測試案例目錄", {
      hyperlink: true,
      headingStyleRange: "1-2",
    }),
    new Paragraph({
      pageBreakBefore: true,
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: "139 項測試案例", font })],
    }),
  ];
  cases.forEach((item, index) =>
    content.push(...caseSection(item, index === 0)),
  );

  return new Document({
    creator: "MT2 Final QA Generator",
    title: "MT2XX 139 測試案例－訊息輸入與預期輸出",
    description: "Frozen workbook-derived QA test case reference",
    styles: {
      default: {
        document: {
          run: { font, size: 18, color: "202B33" },
          paragraph: { spacing: { after: 100, line: 250 } },
        },
      },
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font, size: 30, bold: true, color: navy },
          paragraph: {
            spacing: { before: 240, after: 140 },
            outlineLevel: 0,
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 8, color: teal },
            },
          },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font, size: 23, bold: true, color: navy },
          paragraph: {
            spacing: { before: 180, after: 100 },
            outlineLevel: 1,
          },
        },
        {
          id: "Heading3",
          name: "Heading 3",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font, size: 19, bold: true, color: teal },
          paragraph: {
            spacing: { before: 120, after: 70 },
            outlineLevel: 2,
          },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 900,
              right: 720,
              bottom: 820,
              left: 720,
              header: 360,
              footer: 360,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                border: {
                  bottom: { style: BorderStyle.SINGLE, size: 4, color: teal },
                },
                children: [
                  new TextRun({
                    text: "MT2XX Final QA · 139 Test Cases",
                    color: navy,
                    bold: true,
                    font,
                    size: 15,
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: "Internal QA Reference  |  Page ",
                    font,
                    size: 14,
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font,
                    size: 14,
                  }),
                  new TextRun({ text: " of ", font, size: 14 }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    font,
                    size: 14,
                  }),
                ],
              }),
            ],
          }),
        },
        children: content,
      },
    ],
  });
};

const extractParagraphs = async (docxPath) => {
  const zip = await JSZip.loadAsync(fs.readFileSync(docxPath));
  const xml = await zip.file("word/document.xml").async("string");
  return [...xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)].map(
    (paragraphMatch) => {
      let body = paragraphMatch[1]
        .replace(/<w:br\s*\/>/g, "\n")
        .replace(/<w:tab\s*\/>/g, "\t");
      return decodeXml(
        [...body.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|([\n\t])/g)]
          .map((match) => match[1] ?? match[2])
          .join(""),
      );
    },
  );
};

const caseTitle = (item) => `${item.caseNo} — ${item.messageType}`;

const findCaseSection = (paragraphs, cases, item, index) => {
  const start = paragraphs.indexOf(caseTitle(item));
  const end =
    index + 1 < cases.length
      ? paragraphs.indexOf(caseTitle(cases[index + 1]), start + 1)
      : paragraphs.length;
  return start < 0 || end < 0 ? undefined : paragraphs.slice(start, end);
};

const compareExpectedFields = (item, section) =>
  [
    ["輸入（Input）", item.input],
    ["MX 預期輸出", item.mx],
    ["MT 預期輸出", item.mt],
  ].flatMap(([label, value]) => {
    const labelIndex = section.indexOf(label);
    return labelIndex < 0 || section[labelIndex + 1] !== value
      ? [`${item.caseNo}: ${label} differs from workbook`]
      : [];
  });

const compareMetadata = (item, section) =>
  [
    item.caseNo,
    item.messageType,
    item.domain || "—",
    String(item.expectedStatus ?? "未指定"),
    item.endpoint || "—",
  ].flatMap((value) =>
    section.includes(value)
      ? []
      : [`${item.caseNo}: metadata value missing: ${value}`],
  );

const validateCaseSection = (paragraphs, cases, item, index) => {
  const section = findCaseSection(paragraphs, cases, item, index);
  if (!section) return { mismatches: [`${item.caseNo}: case section missing`] };
  return {
    caseNo: item.caseNo,
    mismatches: [
      ...compareExpectedFields(item, section),
      ...compareMetadata(item, section),
    ],
  };
};

const createDocumentValidation = ({
  workbookHash,
  documentIds,
  mismatches,
}) => ({
  schemaVersion: 1,
  status:
    mismatches.length === 0 &&
    documentIds.length === 139 &&
    new Set(documentIds).size === 139
      ? "PASS"
      : "FAIL",
  sourceWorkbook: path.relative(workspace, workbook).replaceAll("\\", "/"),
  sourceWorkbookSha256: workbookHash,
  document: path.relative(workspace, output).replaceAll("\\", "/"),
  documentSha256: sha256(fs.readFileSync(output)),
  checks: {
    expectedCaseCount: 139,
    documentCaseCount: documentIds.length,
    uniqueDocumentCaseIds: new Set(documentIds).size,
    exactWorkbookFieldsCompared: documentIds.length * 3,
    metadataFieldsCompared: documentIds.length * 5,
    mismatchCount: mismatches.length,
  },
  mismatches,
});

const verifyDocument = async (cases, workbookHash) => {
  const paragraphs = await extractParagraphs(output);
  const results = cases.map((item, index) =>
    validateCaseSection(paragraphs, cases, item, index),
  );
  const mismatches = results.flatMap((result) => result.mismatches);
  const documentIds = results.flatMap((result) =>
    result.caseNo ? [result.caseNo] : [],
  );
  const validation = createDocumentValidation({
    workbookHash,
    documentIds,
    mismatches,
  });
  fs.writeFileSync(
    validationOutput,
    `${JSON.stringify(validation, null, 2)}\n`,
  );
  if (validation.status !== "PASS") {
    throw new Error(`DOCX validation failed: ${mismatches.join("; ")}`);
  }
  return validation;
};

fs.mkdirSync(path.dirname(output), { recursive: true });
const workbookBuffer = fs.readFileSync(workbook);
const workbookHash = sha256(workbookBuffer);
const cases = await loadCases();
const document = makeDocument(cases, workbookHash);
fs.writeFileSync(output, await Packer.toBuffer(document));
const validation = await verifyDocument(cases, workbookHash);
console.log(
  JSON.stringify(
    {
      status: validation.status,
      cases: validation.checks.documentCaseCount,
      exactWorkbookFieldsCompared:
        validation.checks.exactWorkbookFieldsCompared,
      output,
      validationOutput,
      documentSha256: validation.documentSha256,
    },
    null,
    2,
  ),
);
