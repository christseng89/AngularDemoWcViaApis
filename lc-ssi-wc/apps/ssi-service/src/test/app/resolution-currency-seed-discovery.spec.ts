import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { MappingCatalogueService } from "../../app/mapping-catalogue.service";
import { MappingResolutionPageDefinitionSource } from "../../app/page-parameters/mapping-resolution-page-definition.source";
import { PaymentResolutionPageDefinitionSource } from "../../app/page-parameters/payment-resolution-page-definition.source";
import { ResolutionCurrencyCoverageDiscoveryService } from "../../app/resolution-currency-discovery";
import { SqliteSsiRepository } from "../../app/sqlite-ssi.repository";

interface SeedTable {
  columns: string[];
  rows: unknown[][];
}

describe("approved synthetic seed currency discovery", () => {
  const originalPath = process.env["SSI_DATABASE_PATH"];
  let temporaryDirectory: string;
  let repository: SqliteSsiRepository;

  beforeAll(() => {
    temporaryDirectory = mkdtempSync(join(process.cwd(), "tmp", "currency-seed-"));
    const path = join(temporaryDirectory, "seed.sqlite");
    const seed = JSON.parse(readFileSync(join(process.cwd(), "qa", "FIX_DATA", "ssi", "reload-test-data", "ssi-demo.mt1-mt2.v1.approved.canonical.seed.json"), "utf8")) as {
      tables: Record<string, SeedTable>;
    };
    const db = new DatabaseSync(path);
    db.exec("BEGIN IMMEDIATE");
    for (const name of ["ssi", "ssi_applicability"]) {
      const table = seed.tables[name]!;
      db.exec(`CREATE TABLE ${name} (${table.columns.map((column) => `${column} TEXT`).join(",")})`);
      const insert = db.prepare(`INSERT INTO ${name} (${table.columns.join(",")}) VALUES (${table.columns.map(() => "?").join(",")})`);
      for (const row of table.rows) insert.run(...(row as string[]));
    }
    db.exec("COMMIT");
    db.close();
    process.env["SSI_DATABASE_PATH"] = path;
    repository = new SqliteSsiRepository();
  });

  afterAll(() => {
    repository.onModuleDestroy();
    if (originalPath === undefined) delete process.env["SSI_DATABASE_PATH"];
    else process.env["SSI_DATABASE_PATH"] = originalPath;
    rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it("discovers domain coverage from governed profiles, not a universal SSI DISTINCT", () => {
    const discovery = new ResolutionCurrencyCoverageDiscoveryService(
      new MappingResolutionPageDefinitionSource(new MappingCatalogueService()),
      new PaymentResolutionPageDefinitionSource(),
      repository,
    );
    const result = discovery.discover("2026-09-15");
    const currencies = (domain: string) => result.pairs
      .filter((pair) => pair.businessDomain === domain)
      .map((pair) => pair.currency);
    expect(currencies("PAYMENT")).toEqual(["AUD", "CAD", "CHF", "CNY", "EUR", "GBP", "HKD", "JPY", "SGD", "USD"]);
    expect(currencies("TREASURY")).toEqual(["EUR", "GBP", "HKD", "JPY", "USD"]);
    expect(currencies("TRADE_FINANCE")).toEqual(["EUR", "GBP", "HKD", "JPY", "USD"]);
  });

  it("keeps narrow Payment currency SQL equivalent to the original eligibility query", () => {
    for (const profile of new PaymentResolutionPageDefinitionSource().coverageProfiles()) {
      const query = {
        sourceMessageType: profile.messageType,
        messageType: "pacs.009.001.08",
        valueDate: "2026-09-15",
      };
      const original = [...new Set(repository.findPaymentCandidateBindings(query)
        .map(({ ssi }) => ssi.route.currency as string))].sort();
      expect(repository.findPaymentResolutionCurrencies(query)).toEqual(original);
    }
  });

  it("keeps MT202/205 and pacs.009 Core/COV candidate identities and settlement routes across ten governed currencies", () => {
    const currencies = ["AUD", "CAD", "CHF", "CNY", "EUR", "GBP", "HKD", "JPY", "SGD", "USD"];
    for (const sourceMessageType of ["MT202", "MT202COV", "MT205", "MT205COV"]) {
      for (const currency of currencies) {
        const candidates = repository.findPaymentCandidateBindings({
          sourceMessageType,
          messageType: "pacs.009.001.08",
          valueDate: "2026-09-15",
          currency,
          bookingEntity: "HK01",
        });
        expect(candidates.length).toBeGreaterThan(0);
        const seen = new Set<string>();
        for (const { ssi, applicability } of candidates) {
          expect(seen.has(ssi.id)).toBe(false);
          seen.add(ssi.id);
          expect(ssi.route.sourceMessageTypes?.split(",")).toContain(sourceMessageType);
          expect(ssi.route.currency).toBe(currency);
          expect(ssi.route.bookingEntity).toBe("HK01");
          expect(ssi.route.accountId).toBeTruthy();
          expect(ssi.route.actualReceiverBic).toBeTruthy();
          expect(applicability.ssiId).toBe(ssi.id);
        }
        const ranking = candidates.map(({ ssi }) => Number(ssi.route.priority));
        expect(ranking).toEqual([...ranking].sort((a, b) => a - b));
      }
    }
  });
});
