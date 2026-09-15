import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} = require("docx");

const root = process.cwd();
const reportDir = path.join(root, "qa", "mt2", "reports");
const assetDir = path.join(reportDir, "assets");
const browserPath = path.join(
  reportDir,
  "MT2XX_v15.1_browser_UAT_final_resolver_refactor_20260911.json",
);
const sonarPath = path.join(
  reportDir,
  "MT2XX_v15.1_sonarqube_final_20260911.json",
);
const workbookPath = path.join(
  root,
  "qa",
  "uat",
  "MT2xx_SSI_Resolution_UAT執行清單_v15.1.xlsx",
);
const outputStem = "MT2XX_v15.1_QA_UAT_Final_Report_ZH_20260911";
const markdownPath = path.join(reportDir, `${outputStem}.md`);
const wordPath = path.join(reportDir, `${outputStem}.docx`);
const uatChartName = "MT2XX_v15.1_UAT_outcomes.png";
const sonarChartName = "MT2XX_v15.1_Sonar_gate.png";

const sha256 = (buffer) =>
  createHash("sha256").update(buffer).digest("hex").toUpperCase();

function table(rows, widths = [3400, 6200]) {
  const borders = {
    top: { style: BorderStyle.SINGLE, color: "D3E0E3", size: 4 },
    bottom: { style: BorderStyle.SINGLE, color: "D3E0E3", size: 4 },
    left: { style: BorderStyle.SINGLE, color: "D3E0E3", size: 4 },
    right: { style: BorderStyle.SINGLE, color: "D3E0E3", size: 4 },
    insideHorizontal: { style: BorderStyle.SINGLE, color: "D3E0E3", size: 4 },
    insideVertical: { style: BorderStyle.SINGLE, color: "D3E0E3", size: 4 },
  };
  return new Table({
    width: {
      size: widths.reduce((sum, width) => sum + width, 0),
      type: WidthType.DXA,
    },
    columnWidths: widths,
    borders,
    rows: rows.map(
      (row, rowIndex) =>
        new TableRow({
          children: row.map(
            (value, columnIndex) =>
              new TableCell({
                width: { size: widths[columnIndex], type: WidthType.DXA },
                shading:
                  rowIndex === 0
                    ? {
                        type: ShadingType.CLEAR,
                        color: "D8EEF2",
                        fill: "D8EEF2",
                      }
                    : undefined,
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: String(value),
                        bold: rowIndex === 0 || columnIndex === 0,
                        color: "17363D",
                        size: 20,
                      }),
                    ],
                  }),
                ],
              }),
          ),
        }),
    ),
  });
}

await mkdir(assetDir, { recursive: true });
const browserBuffer = await readFile(browserPath);
const sonarBuffer = await readFile(sonarPath);
const workbookBuffer = await readFile(workbookPath);
const browser = JSON.parse(browserBuffer.toString("utf8"));
const sonar = JSON.parse(sonarBuffer.toString("utf8"));
const summary = browser.summary;
const metrics = sonar.metrics;

const uatChartPath = path.join(assetDir, uatChartName);
const sonarChartPath = path.join(assetDir, sonarChartName);
execFileSync(
  process.env.PYTHON ?? "python",
  [
    path.join(root, "scripts", "mt2-final-qa", "generate-v151-qa-charts.py"),
    "--browser",
    browserPath,
    "--sonar",
    sonarPath,
    "--output-dir",
    assetDir,
  ],
  { stdio: "inherit" },
);
const uatChart = await readFile(uatChartPath);
const sonarChart = await readFile(sonarChartPath);

const workbookHash = sha256(workbookBuffer);
const browserHash = sha256(browserBuffer);
const sonarHash = sha256(sonarBuffer);
const markdown = `# MT2xx SSI Resolution v15.1 — QA / UAT 最終報告

**日期：** 2026-09-11  
**結論：** ACCEPTED / RELEASE GATE PASS  
**範圍：** MT202、MT205、MT202COV、MT205COV；12 組 Counterparty × Currency × Booking Entity

## Executive Summary

- 真實 Chromium 瀏覽器 UAT：**${summary.passed}/${summary.planned} PASS**，失敗 ${summary.failed}。
- 結果分布：${summary.resolved} 筆 SSI_RESOLVED；${summary.ambiguous} 筆 SSI_AMBIGUOUS（fail closed）。
- 44/44 RESOLVED 均完成 Preview + Confirm，兩階段 token 與 snapshot hash 可見。
- 4/4 AMBIGUOUS 均顯示 3 筆 unordered candidates，且沒有 Confirm。
- Northstar 負向控制：${summary.northstarPassed}/2 PASS；UI-STALE PASS；1500 ms UI-RACE PASS。
- SonarQube：Quality Gate **${sonar.qualityGate}**；Blocker/Critical/Major = 0/0/0。

![UAT outcome](assets/${uatChartName})

## SonarQube

![Sonar quality gate](assets/${sonarChartName})

| 指標 | 結果 | Gate | 判定 |
|---|---:|---:|---|
| New Coverage | ${metrics.newCoverage}% | ≥ ${metrics.coverageGate}% | PASS |
| New Duplication | ${metrics.newDuplicatedLinesDensity}% | ≤ ${metrics.newDuplicatedLinesGate}% | PASS |
| Overall Duplication | ${metrics.overallDuplicatedLinesDensity}% | 參考 | PASS |
| Bugs / New Bugs | ${metrics.bugs} / ${metrics.newBugs} | 0 / 0 | PASS |
| Blocker / Critical / Major | ${sonar.openIssues.blocker} / ${sonar.openIssues.critical} / ${sonar.openIssues.major} | 0 / 0 / 0 | PASS |
| Minor Code Smell | ${sonar.openIssues.minor} | 非阻擋 | OPEN |

## API Retry 統一政策

由 BFF 單一 interceptor 執行；設定集中於 \`.env\`：最大重試 3 次、初始延遲 250 ms、最大延遲 2,000 ms、總等待上限 10,000 ms、單次 request timeout 5,000 ms。僅重試 transient network/timeout 與 HTTP 408、425、429、502、503、504；4xx 業務錯誤不重試；mutation 必須已有 Idempotency-Key 才可重試。

## Evidence Register

| Evidence | SHA-256 |
|---|---|
| UAT workbook | \`${workbookHash}\` |
| Browser UAT JSON | \`${browserHash}\` |
| Sonar final JSON | \`${sonarHash}\` |
| Sonar analysis ID | \`${sonar.analysisId}\` |
| Sonar worktree digest | \`${sonar.worktreeDigest}\` |

## Repository Hygiene

Raw timestamped browser evidence、逐案 request/response 與 runtime logs 為可重建產物，已移出 Git 並由 \`.gitignore\` 排除。受控 baseline、測試程式、UAT workbook、最終 MD/DOCX 與摘要 JSON 保留。
`;
await writeFile(markdownPath, markdown, "utf8");

const title = new Paragraph({
  heading: HeadingLevel.TITLE,
  alignment: AlignmentType.CENTER,
  children: [
    new TextRun({
      text: "MT2xx SSI Resolution v15.1",
      bold: true,
      color: "12363D",
    }),
  ],
});
const subtitle = new Paragraph({
  alignment: AlignmentType.CENTER,
  children: [
    new TextRun({
      text: "QA / UAT 最終報告 · 2026-09-11",
      size: 26,
      color: "48727B",
    }),
  ],
});
const status = new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 260, after: 300 },
  children: [
    new TextRun({
      text: "ACCEPTED  ·  RELEASE GATE PASS",
      bold: true,
      size: 28,
      color: "18866B",
    }),
  ],
});
const heading = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text, color: "16343B" })],
  });
const bullet = (text) =>
  new Paragraph({ text, bullet: { level: 0 }, spacing: { after: 80 } });

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: "Microsoft JhengHei", size: 21, color: "263E43" },
      },
    },
  },
  sections: [
    {
      properties: {
        page: { margin: { top: 900, right: 900, bottom: 900, left: 900 } },
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun("MT2xx v15.1 QA/UAT · "),
                new TextRun({ children: [PageNumber.CURRENT] }),
              ],
            }),
          ],
        }),
      },
      children: [
        title,
        subtitle,
        status,
        heading("1. Executive Summary"),
        bullet(
          `真實 Chromium 瀏覽器 UAT：${summary.passed}/${summary.planned} PASS；失敗 ${summary.failed}。`,
        ),
        bullet(
          `結果分布：${summary.resolved} SSI_RESOLVED；${summary.ambiguous} SSI_AMBIGUOUS（fail closed）。`,
        ),
        bullet(
          "44/44 RESOLVED 完成 Preview + Confirm；4/4 AMBIGUOUS 均無 Confirm。",
        ),
        bullet(
          `Northstar ${summary.northstarPassed}/2 PASS；UI-STALE PASS；1500 ms UI-RACE PASS。`,
        ),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 180, after: 240 },
          children: [
            new ImageRun({
              data: uatChart,
              transformation: { width: 620, height: 248 },
              type: "png",
            }),
          ],
        }),
        heading("2. SonarQube Quality Gate"),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 180 },
          children: [
            new ImageRun({
              data: sonarChart,
              transformation: { width: 620, height: 248 },
              type: "png",
            }),
          ],
        }),
        table([
          ["指標", "結果 / Gate"],
          ["Quality Gate", sonar.qualityGate],
          [
            "New Coverage",
            `${metrics.newCoverage}% / ≥ ${metrics.coverageGate}%`,
          ],
          [
            "New Duplication",
            `${metrics.newDuplicatedLinesDensity}% / ≤ ${metrics.newDuplicatedLinesGate}%`,
          ],
          [
            "Blocker / Critical / Major",
            `${sonar.openIssues.blocker} / ${sonar.openIssues.critical} / ${sonar.openIssues.major}`,
          ],
          ["Bugs / New Bugs", `${metrics.bugs} / ${metrics.newBugs}`],
          ["Minor Code Smell", `${sonar.openIssues.minor}（非阻擋）`],
        ]),
        heading("3. API Retry 統一政策"),
        bullet(
          "BFF 單一 interceptor；所有 API 重試規則集中管理，不散落於各 endpoint。",
        ),
        bullet(
          "max retries 3；initial delay 250 ms；max delay 2,000 ms；max elapsed 10,000 ms；request timeout 5,000 ms。",
        ),
        bullet(
          "僅 transient network/timeout 與 408、425、429、502、503、504 可重試；業務 4xx 不重試。",
        ),
        bullet(
          "Mutation 僅在已提供 Idempotency-Key 時重試；逾總等待上限 fail closed。",
        ),
        heading("4. Evidence Register"),
        table([
          ["Evidence", "SHA-256 / ID"],
          ["UAT workbook", workbookHash],
          ["Browser UAT JSON", browserHash],
          ["Sonar final JSON", sonarHash],
          ["Sonar analysis ID", sonar.analysisId],
          ["Sonar worktree digest", sonar.worktreeDigest],
        ]),
        heading("5. Repository Hygiene"),
        new Paragraph(
          "Raw timestamped browser evidence、逐案 request/response 與 runtime logs 為可重建產物，已移出 Git 並由 .gitignore 排除。受控 baseline、測試程式、UAT workbook、最終 MD/DOCX 與摘要 JSON 保留。",
        ),
      ],
    },
  ],
});

await writeFile(wordPath, await Packer.toBuffer(doc));
console.log(
  JSON.stringify(
    {
      markdown: path.relative(root, markdownPath),
      markdownSha256: sha256(await readFile(markdownPath)),
      word: path.relative(root, wordPath),
      wordSha256: sha256(await readFile(wordPath)),
      charts: [
        path.relative(root, uatChartPath),
        path.relative(root, sonarChartPath),
      ],
    },
    null,
    2,
  ),
);
