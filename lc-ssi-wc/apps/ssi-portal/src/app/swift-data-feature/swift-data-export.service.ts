import { DOCUMENT } from "@angular/common";
import { inject, Injectable } from "@angular/core";
import { scalarText } from "../scalar-text";
import type { ExportColumn, Row, StatusFilter, UiResource } from "./swift-data.models";

type ExcelWorkbook = import("exceljs").Workbook;
type ExcelWorksheet = import("exceljs").Worksheet;

export interface SwiftDataExportContext {
  resource: UiResource;
  rows: readonly Row[];
  statusFilter: StatusFilter;
  sortPath: string | null;
  sortDirection: "asc" | "desc";
  value(row: Row, path: string): string;
}

/** File generation and browser download only; no index or lifecycle state. */
@Injectable()
export class SwiftDataExportService {
  private readonly document = inject(DOCUMENT);

  async excel(context: SwiftDataExportContext): Promise<void> {
    const excelJsModule =
      (await import("exceljs")) as typeof import("exceljs") & {
        default?: typeof import("exceljs");
      };
    const ExcelJS = excelJsModule.default ?? excelJsModule;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Baseline SSI Prototype";
    workbook.created = new Date();
    this.addDataSheet(workbook, context);
    if (context.resource.id === "ssi")
      this.addApplicabilitySheet(workbook, context);
    this.addMetadataSheet(workbook, context);
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([new Uint8Array(buffer)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    this.download(blob, this.exportFileName(context, "xlsx"));
  }

  json(context: SwiftDataExportContext): void {
    const generatedAt = new Date().toISOString();
    const payload = {
      metadata: {
        schemaVersion: "1.0",
        resourceId: context.resource.id,
        resourceLabel: context.resource.label,
        endpoint: context.resource.endpoint,
        statusFilter: context.statusFilter,
        sort: context.sortPath
          ? { path: context.sortPath, direction: context.sortDirection }
          : null,
        exportedRecords: context.rows.length,
        generatedAt,
        encoding: "UTF-8",
        source: "Local synthetic prototype data",
        disclaimer:
          "Synthetic prototype data only; never use as payment instructions.",
      },
      records: context.rows,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(payload, null, 2));
    this.download(
      new Blob([bytes], { type: "application/json;charset=utf-8" }),
      this.exportFileName(context, "json"),
    );
  }

  private exportColumns(resource: UiResource): readonly ExportColumn[] {
    return (
      resource.exportColumns ??
      resource.columns.flatMap((column) =>
        column.path
          ? [{ path: column.path, label: column.label }]
          : (column.paths ?? []).map((path) => ({ path, label: path })),
      )
    );
  }

  private styleHeader(sheet: ExcelWorksheet): void {
    sheet.getRow(1).eachCell((cell) => {
      cell.font = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF17363D" },
      };
      cell.alignment = { vertical: "middle" };
    });
    sheet.getRow(1).height = 24;
  }

  private addDataSheet(
    workbook: ExcelWorkbook,
    context: SwiftDataExportContext,
  ): void {
    const { resource, rows } = context;
    const sheet = workbook.addWorksheet(resource.label.slice(0, 31), {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    const columns = this.exportColumns(resource);
    sheet.columns = columns.map((column, index) => ({
      header: column.label,
      key: `column${index}`,
      width: Math.max(14, Math.min(42, column.label.length + 8)),
    }));
    for (const row of rows)
      sheet.addRow(
        Object.fromEntries(
          columns.map((column, index) => [
            `column${index}`,
            context.value(row, column.path),
          ]),
        ),
      );
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, sheet.rowCount), column: columns.length },
    };
    this.styleHeader(sheet);
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber <= 1) return;
      row.font = { name: "Arial", size: 10 };
      if (rowNumber % 2 === 0)
        row.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF1F5F2" },
          };
        });
    });
    for (let index = 1; index <= columns.length; index += 1) {
      const column = sheet.getColumn(index);
      let width = 14;
      column.eachCell({ includeEmpty: true }, (cell) => {
        width = Math.max(width, Math.min(42, scalarText(cell.value).length + 2));
      });
      column.width = width;
    }
  }

  private addApplicabilitySheet(
    workbook: ExcelWorkbook,
    context: SwiftDataExportContext,
  ): void {
    const sheet = workbook.addWorksheet("SSI Applicability", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    const headers = [
      "SSI ID", "Consumer", "Product", "Business Function", "Payment Leg",
      "Direction", "Status", "Effective From", "Effective To", "Version",
    ];
    sheet.columns = headers.map((header, index) => ({
      header,
      key: `column${index}`,
      width: Math.max(14, header.length + 8),
    }));
    for (const row of context.rows) {
      const links = Array.isArray(row["applicability"])
        ? (row["applicability"] as Record<string, unknown>[])
        : [];
      for (const link of links)
        sheet.addRow({
          column0: context.value(row, "route.ssiCode"),
          column1: link["consumer"],
          column2: link["product"],
          column3: link["businessFunction"],
          column4: link["paymentLeg"],
          column5: link["direction"],
          column6: link["status"],
          column7: link["validFrom"],
          column8: link["validTo"],
          column9: link["version"],
        });
    }
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, sheet.rowCount), column: headers.length },
    };
    this.styleHeader(sheet);
  }

  private addMetadataSheet(
    workbook: ExcelWorkbook,
    context: SwiftDataExportContext,
  ): void {
    const sheet = workbook.addWorksheet("Export Metadata");
    sheet.addRows([
      ["Field", "Value"],
      ["Resource", context.resource.label],
      ["Status filter", context.statusFilter],
      ["Sort", context.sortPath ? `${context.sortPath} ${context.sortDirection}` : "API order"],
      ["Exported records", context.rows.length],
      ["Generated at", new Date().toISOString()],
      ["Source", "Local synthetic prototype data; never use as payment instructions."],
    ]);
    sheet.getColumn(1).width = 24;
    sheet.getColumn(2).width = 72;
    sheet.eachRow((row, index) => {
      row.font = { name: "Arial", bold: index === 1 };
    });
  }

  private exportFileName(context: SwiftDataExportContext, extension: "xlsx" | "json"): string {
    return `${context.resource.id}-${context.statusFilter.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.${extension}`;
  }

  private download(blob: Blob, fileName: string): void {
    const view = this.document.defaultView;
    if (!view) throw new Error("瀏覽器下載服務不可用");
    const url = view.URL.createObjectURL(blob);
    const link = this.document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.hidden = true;
    this.document.body.appendChild(link);
    link.click();
    link.remove();
    view.setTimeout(() => view.URL.revokeObjectURL(url), 1000);
  }
}
