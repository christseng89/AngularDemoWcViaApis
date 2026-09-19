import { Workbook } from "exceljs";
import { SwiftDataExportService, type SwiftDataExportContext } from "./swift-data-export.service";

let fakeDocument: unknown;
jest.mock("@angular/common", () => ({ DOCUMENT: Symbol("DOCUMENT") }));
jest.mock("@angular/core", () => ({
  Injectable: () => <T>(target: T): T => target,
  inject: () => fakeDocument,
}));

const resource: SwiftDataExportContext["resource"] = {
  id: "rma",
  label: "RMA Authorisations",
  endpoint: "rma-authorisations",
  description: "",
  columns: [{ path: "id", label: "ID" }, { path: "status", label: "Status" }],
  fields: [],
  "x-lifecycle": [],
};
const row = { id: "RMA-1", status: "ACTIVE", version: 1, maker: "maker" };
const context: SwiftDataExportContext = {
  resource,
  rows: [row],
  statusFilter: "ACTIVE",
  sortPath: "id",
  sortDirection: "asc",
  value: (item, path) => String(item[path]),
};

const readBlob = (blob: Blob, as: "text" | "arraybuffer"): Promise<string | ArrayBuffer> =>
  as === "text" ? blob.text() : blob.arrayBuffer();

describe("SwiftDataExportService", () => {
  let blob: Blob | null;
  let link: { href: string; download: string; hidden: boolean; click: jest.Mock; remove: jest.Mock };
  let revokeObjectURL: jest.Mock;
  let service: SwiftDataExportService;

  beforeEach(() => {
    blob = null;
    revokeObjectURL = jest.fn();
    link = { href: "", download: "", hidden: false, click: jest.fn(), remove: jest.fn() };
    fakeDocument = {
      defaultView: {
        URL: {
          createObjectURL: jest.fn((value: Blob) => { blob = value; return "blob:isolated-export"; }),
          revokeObjectURL,
        },
        setTimeout: (callback: () => void) => { callback(); return 1; },
      },
      createElement: jest.fn(() => link),
      body: { appendChild: jest.fn() },
    };
    service = new SwiftDataExportService();
  });

  it("exports JSON metadata, records, filename and revokes the object URL", async () => {
    service.json(context);
    expect(link.download).toMatch(/^rma-active-\d{4}-\d{2}-\d{2}\.json$/);
    expect(link.href).toBe("blob:isolated-export");
    expect(link.click).toHaveBeenCalledTimes(1);
    expect(link.remove).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:isolated-export");
    const payload = JSON.parse(await readBlob(blob!, "text") as string);
    expect(payload.metadata).toMatchObject({
      resourceId: "rma", endpoint: "rma-authorisations", statusFilter: "ACTIVE",
      sort: { path: "id", direction: "asc" }, exportedRecords: 1, encoding: "UTF-8",
    });
    expect(payload.records).toEqual([row]);
  });

  it("exports Excel data and metadata sheets with original governed columns", async () => {
    await service.excel(context);
    expect(link.download).toMatch(/^rma-active-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(link.click).toHaveBeenCalledTimes(1);
    expect(link.remove).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:isolated-export");
    const bytes = await readBlob(blob!, "arraybuffer") as ArrayBuffer;
    const workbook = new Workbook();
    await workbook.xlsx.load(Buffer.from(bytes));
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["RMA Authorisations", "Export Metadata"]);
    const sheet = workbook.getWorksheet("RMA Authorisations")!;
    expect(sheet.getRow(1).values).toEqual([undefined, "ID", "Status"]);
    expect(sheet.getRow(2).values).toEqual([undefined, "RMA-1", "ACTIVE"]);
    expect(workbook.getWorksheet("Export Metadata")!.getCell("B5").value).toBe(1);
  });
});
