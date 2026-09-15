import {
  lookupDependenciesSatisfied,
  lookupResolutionKey,
} from "./lookup-resolution-key";
import { bankServiceDescription } from "./bank-service-presentation";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const metadata = {
  provider: "SSI_COUNTERPARTY" as const,
  action: "SSI_COUNTERPARTY" as const,
  endpoint: "/api/v1/resolution-page-definitions/lookups/ssi-counterparties",
  valueField: "bankServiceId" as const,
  displayField: "bic" as const,
  validationField: "bic" as const,
};

describe("BankServiceLookupComponent resolution identity", () => {
  it("shows the institution name once and suppresses a duplicate BIC description", () => {
    expect(
      bankServiceDescription({
        provider: "SSI_COUNTERPARTY",
        action: "SSI_COUNTERPARTY",
        bankServiceId: "BANK-SVC-CITIUS33",
        bic: "CITIUS33",
        displayValue: "CITIUS33 — Citibank N.A.",
        bankName: "Citibank N.A.",
      }),
    ).toBe("Citibank N.A.");
    expect(
      bankServiceDescription({
        provider: "SSI_COUNTERPARTY",
        action: "SSI_COUNTERPARTY",
        bankServiceId: "BANK-SVC-CITIUS33",
        bic: "CITIUS33",
        displayValue: "CITIUS33",
      }),
    ).toBe("");
    const template = readFileSync(
      join(
        process.cwd(),
        "apps/ssi-portal/src/app/resolution-workbench/bank-service-lookup.component.html",
      ),
      "utf8",
    );
    expect(template).not.toContain("Selected SSI counterparty");
    expect(template).toContain("<output");
    expect(template).toContain('class="lookup-spinner"');
    expect(template).toContain("!lookupAvailable()");
  });

  it("does not render a stale selection while a governed replacement loads", () => {
    const template = readFileSync(
      join(
        process.cwd(),
        "apps/ssi-portal/src/app/resolution-workbench/bank-service-lookup.component.html",
      ),
      "utf8",
    );

    expect(template).toContain("displayedSelection(); as bank");
    expect(template.indexOf('phase() === "loading"')).toBeLessThan(
      template.indexOf("displayedSelection(); as bank"),
    );
  });
  it("waits until every governed lookup dependency is populated", () => {
    const dependencyMetadata = {
      ...metadata,
      dependency: {
        dependsOnFieldIds: ["context.currency", "context.valueDate"],
        invalidatesFieldIds: [],
        selectionPolicy: "SELECTABLE" as const,
      },
    };

    expect(
      lookupDependenciesSatisfied(dependencyMetadata, {
        dependencyValues: {
          "context.currency": "USD",
          "context.valueDate": "",
        },
      }),
    ).toBe(false);
    expect(
      lookupDependenciesSatisfied(dependencyMetadata, {
        dependencyValues: {
          "context.currency": "USD",
          "context.valueDate": "2026-09-13",
        },
      }),
    ).toBe(true);
  });

  it("changes when governed lookup dependencies change", () => {
    const governedMetadata = {
      ...metadata,
      dependency: {
        dependsOnFieldIds: ["context.currency", "context.valueDate"],
        invalidatesFieldIds: [],
        selectionPolicy: "SELECTABLE" as const,
      },
    };
    const before = lookupResolutionKey(governedMetadata, "BANK-SVC-DEUTDEFF", {
      scenarioId: "MT300-001",
      messageType: "MT300",
      sequence: "B1",
      dependencyValues: {
        "context.currency": "USD",
        "context.valueDate": "",
      },
    });
    const after = lookupResolutionKey(governedMetadata, "BANK-SVC-DEUTDEFF", {
      scenarioId: "MT300-001",
      messageType: "MT300",
      sequence: "B1",
      dependencyValues: {
        "context.currency": "USD",
        "context.valueDate": "2026-09-13",
      },
    });

    expect(after).not.toBe(before);
  });

  it("does not re-resolve when an unrelated form field changes", () => {
    const governedMetadata = {
      ...metadata,
      dependency: {
        dependsOnFieldIds: ["context.currency", "context.valueDate"],
        invalidatesFieldIds: [],
        selectionPolicy: "SELECTABLE" as const,
      },
    };
    const before = lookupResolutionKey(governedMetadata, "BANK-SVC-DEUTDEFF", {
      dependencyValues: {
        "context.currency": "USD",
        "context.valueDate": "2026-09-15",
        "context.ownDebitAccountId": "NOSTRO-1",
      },
    });
    const after = lookupResolutionKey(governedMetadata, "BANK-SVC-DEUTDEFF", {
      dependencyValues: {
        "context.currency": "USD",
        "context.valueDate": "2026-09-15",
        "context.ownDebitAccountId": "NOSTRO-2",
      },
    });

    expect(after).toBe(before);
  });

  it("is stable when dependency insertion order differs", () => {
    const left = lookupResolutionKey(metadata, "", {
      dependencyValues: { currency: "USD", valueDate: "2026-09-13" },
    });
    const right = lookupResolutionKey(metadata, "", {
      dependencyValues: { valueDate: "2026-09-13", currency: "USD" },
    });

    expect(right).toBe(left);
  });
});
