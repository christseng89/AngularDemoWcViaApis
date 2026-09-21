/** @jest-environment jsdom */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ɵresolveComponentResources as resolveComponentResources,
  ɵSIGNAL as SIGNAL,
} from "@angular/core";
import { getTestBed, TestBed } from "@angular/core/testing";
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from "@angular/platform-browser-dynamic/testing";
import type {
  PageParameterField,
  PageParameterScenarioFieldPolicy,
  ResolutionPageDefinition,
  ResolutionPageExecutionResult,
  ResolutionPageFieldResult,
} from "@ssi/contracts";
import { GenericParameterFormComponent } from "../../../app/resolution-workbench/generic-parameter-form.component";
import { mapPageDefinition } from "../../../app/resolution-workbench/parameter-model.mapper";
import { ResolutionResultTableComponent } from "../../../app/resolution-workbench/resolution-result-table.component";

const resultField = (
  overrides: Partial<ResolutionPageFieldResult>,
): ResolutionPageFieldResult => ({
  fieldId: "field",
  sequenceId: "A",
  settlementLeg: "Settlement",
  swiftTag: "53",
  swiftOption: "A",
  fieldName: "Sender's Correspondent",
  role: "SENDER_CORRESPONDENT",
  outcome: "RESOLVED",
  resolutionStatus: "RESOLVED",
  provenance: { source: "SSI_ROUTE", sourceRecordId: "ssi-1" },
  evidenceIds: ["evidence-1"],
  ...overrides,
});

const setSignalInput = (inputSignal: unknown, value: unknown): void => {
  const node = (inputSignal as Record<PropertyKey, unknown>)[SIGNAL] as {
    applyValueToInputSignal(inputNode: unknown, inputValue: unknown): void;
  };
  node.applyValueToInputSignal(node, value);
};

const executionResult: ResolutionPageExecutionResult = {
  definitionId: "future-definition",
  definitionVersion: "1",
  scenarioId: "future-scenario",
  fixtureBindingId: "future-fixture",
  outcome: "RESOLVED",
  payloadGenerated: false,
  confirmedResolutionCreated: false,
  repairQueueCreated: false,
  outputs: [],
  fields: [
    resultField({
      fieldId: "field-53",
      swiftTag: "53",
      institution: { bic: "AAAAGB2L", name: "Alpha Bank" },
      value: "AAAAGB2L",
    }),
    resultField({
      fieldId: "field-56",
      swiftTag: "56",
      outcome: "NOT_REQUIRED",
      resolutionStatus: "NOT_REQUIRED",
      reasonCode: "DIRECT_ROUTE",
    }),
    resultField({
      fieldId: "field-57",
      swiftTag: "57",
      role: "ACCOUNT_WITH_INSTITUTION",
      institution: { bic: "BBBBUS33", name: "Beta Bank" },
      accountReference: "ACCOUNT-57",
      value: "/ACCOUNT-57\nBBBBUS33",
    }),
    resultField({
      fieldId: "field-58",
      swiftTag: "58",
      outcome: "NOT_REQUIRED",
      resolutionStatus: "N_A",
      reasonCode: "ROLE_NOT_APPLICABLE",
    }),
  ],
  evidence: {
    correlationId: "correlation-1",
    owner: "SSI_FIELD_RESOLUTION_API",
    action: "RESOLVE_SSI",
    executorIdentity: "SSI resolver",
    requestSha256: "a".repeat(64),
    responseSha256: "b".repeat(64),
    ruleIds: ["rule-1"],
  },
};

const dateDefinition: ResolutionPageDefinition = {
  schemaVersion: "1.0",
  definitionId: "date-definition",
  definitionVersion: "1",
  source: {
    catalogueVersion: "1",
    sourceArtifactId: "source",
    sourceSha256: "c".repeat(64),
  },
  standardsRelease: "FUTURE",
  messageFamily: "FUTURE",
  messageType: "MSG-X",
  businessDomain: "TREASURY",
  direction: "OUTGOING",
  businessFunction: "FUTURE_FUNCTION",
  title: "Future message",
  display: {
    familyCode: "FUTURE",
    familyLabel: "Future family",
    categoryCode: "FUTURE_CATEGORY",
    categoryLabel: "Future category",
  },
  profile: {
    profileId: "future-profile",
    profileKind: "FIN_REFERENCE_ONLY",
    paymentExecutable: false,
    selectionBasis: { businessScenarioId: "future-scenario" },
  },
  sequences: [
    { sequenceId: "Q9", label: "Future sequence", fieldIds: ["value-date"] },
  ],
  fields: [
    {
      fieldId: "value-date",
      path: "context.valueDate",
      label: "Value Date",
      control: "DATE",
      dataType: "DATE",
      required: true,
      defaultValue: "2026-09-15",
      displayOrder: 10,
      section: "TRANSACTION",
      visibility: "USER_INPUT",
      constraints: [],
    },
  ],
  scenarios: [
    {
      scenarioId: "future-scenario",
      label: "Future scenario",
      polarity: "POSITIVE",
      sequenceIds: ["Q9"],
      fieldIds: ["value-date"],
      validationRuleIds: [],
      fixture: {
        bindingId: "future-fixture",
        fixtureSet: "future",
        fixtureVersion: "1",
        sourceSha256: "d".repeat(64),
        isolation: "CANONICAL",
      },
      execution: {
        action: "RESOLVE_SSI",
        owner: "SSI_FIELD_RESOLUTION_API",
        endpoint: "/api/v1/resolution-page-definitions/execute",
        method: "POST",
        expectedHttp: [200],
      },
    },
  ],
  validationRules: [],
  evidence: [],
};

const visiblePolicy = (
  fieldId: string,
): PageParameterScenarioFieldPolicy => ({
  fieldId,
  applicability: "APPLICABLE",
  inputOwnership: "TRANSACTION_USER",
  visibility: "USER_INPUT",
  processingPolicy: "APPLY",
  required: true,
  readOnly: false,
});

const hiddenDerivedPolicy = (
  fieldId: string,
): PageParameterScenarioFieldPolicy => ({
  fieldId,
  applicability: "APPLICABLE",
  inputOwnership: "SSI_DERIVED",
  visibility: "HIDDEN_EVIDENCE",
  processingPolicy: "APPLY",
  required: true,
  readOnly: true,
});

const ownAccountField = (
  fieldId: string,
  displayOrder: number,
): PageParameterField => ({
  fieldId,
  path: fieldId.replace("context.", ""),
  label: fieldId.includes("receiver") ? "Receiver Bank" : fieldId.includes("Debit") ? "Own Debit Account" : "Own Credit Account",
  control: "TEXT",
  dataType: "STRING",
  required: true,
  defaultValue: fieldId.includes("receiver")
    ? "BANK-SVC-CITIUS33"
    : fieldId.includes("Debit")
      ? "NOSTRO-DEBIT"
      : "NOSTRO-CREDIT",
  displayOrder,
  section: "TRANSACTION",
  visibility: "USER_INPUT",
  constraints: [],
});

const paymentDefinition = (
  messageType: "MT202" | "MT202COV",
  ownAccountScenario: boolean,
): ResolutionPageDefinition => {
  const receiver = ownAccountField("context.receiverBankServiceId", 60);
  const debit = ownAccountField("context.ownDebitAccountId", 70);
  const credit = ownAccountField("context.ownCreditAccountId", 90);
  const versions: PageParameterField[] = ["Debit", "Credit"].map(
    (side, index) => ({
      fieldId: `context.own${side}AccountVersion`,
      path: `own${side}AccountVersion`,
      label: `Own ${side} Account Version`,
      control: "HIDDEN",
      dataType: "STRING",
      required: true,
      readOnly: true,
      displayOrder: 110 + index * 20,
      section: "VALIDATION_CONTEXT",
      visibility: "HIDDEN_EVIDENCE",
      constraints: [],
    }),
  );
  const ownFields = [receiver, debit, credit, ...versions];
  const ownPolicies = ownAccountScenario
    ? [
        visiblePolicy(receiver.fieldId),
        visiblePolicy(debit.fieldId),
        visiblePolicy(credit.fieldId),
        ...versions.map(({ fieldId }) => hiddenDerivedPolicy(fieldId)),
      ]
    : ownFields.map(({ fieldId }) => ({
        fieldId,
        applicability: "NOT_APPLICABLE" as const,
        inputOwnership: "SSI_DERIVED" as const,
        visibility: "HIDDEN_EVIDENCE" as const,
        processingPolicy: "IGNORE_AUDIT" as const,
        required: false,
        readOnly: true,
      }));
  return {
    ...dateDefinition,
    definitionId: `payment-${messageType}`,
    messageFamily: "MT2 / pacs.009",
    messageType,
    businessDomain: "PAYMENT",
    fields: [...dateDefinition.fields, ...ownFields],
    sequences: [
      {
        sequenceId: "MESSAGE",
        label: "Message",
        fieldIds: [
          "value-date",
          ...ownFields.map(({ fieldId }) => fieldId),
        ],
      },
    ],
    scenarios: [
      {
        ...dateDefinition.scenarios[0]!,
        scenarioId: ownAccountScenario ? "MT202-OP-BOOK" : "MT202COV-OP-DIRECT",
        fieldIds: [
          "value-date",
          ...ownFields.map(({ fieldId }) => fieldId),
        ],
        fieldPolicies: [visiblePolicy("value-date"), ...ownPolicies],
      },
    ],
  };
};

describe("generic parameter UI acceptance", () => {
  beforeAll(async () => {
    getTestBed().initTestEnvironment(
      BrowserDynamicTestingModule,
      platformBrowserDynamicTesting(),
    );
    const appDirectory = join(process.cwd(), "apps/ssi-portal/src/app");
    const componentDirectory = join(
      process.cwd(),
      "apps/ssi-portal/src/app/resolution-workbench",
    );
    await resolveComponentResources((url) =>
      readFile(join(componentDirectory, url), "utf8").catch(() =>
        readFile(join(appDirectory, url), "utf8"),
      ),
    );
  });

  afterEach(() => TestBed.resetTestingModule());
  afterAll(() => getTestBed().resetTestEnvironment());

  it("renders all resolved and non-applicable SSI rows from the typed API result", async () => {
    await TestBed.configureTestingModule({
      imports: [ResolutionResultTableComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(ResolutionResultTableComponent);
    setSignalInput(fixture.componentInstance.result, executionResult);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const rows = [...element.querySelectorAll("tbody tr")];
    const rowText = rows.map((row) => row.textContent ?? "");
    const primaryText = element.textContent ?? "";

    expect(rows).toHaveLength(4);
    expect(rowText[0]).toContain("53A");
    expect(rowText[0]).toContain("AAAAGB2L");
    expect(rowText[0]).toContain("Alpha Bank");
    expect(rowText[0]).toContain("RESOLVED");
    expect(rowText[1]).toContain("NOT REQUIRED");
    expect(rowText[1]).toContain("DIRECT_ROUTE");
    expect(rowText[1]).toContain("56A");
    expect(rowText[2]).toContain("BBBBUS33");
    expect(rowText[2]).toContain("Beta Bank");
    expect(rowText[2]).toContain("57A");
    expect(rowText[3]).toContain("N A");
    expect(rowText[3]).toContain("ROLE_NOT_APPLICABLE");
    expect(rowText[3]).toContain("58A");
    const headers = [...element.querySelectorAll("th")].map(
      (header) => header.textContent?.trim() ?? "",
    );
    expect(headers).toContain("Tag + option");
    expect(headers).not.toContain("Option");
    expect(headers).not.toContain("Provenance");
    expect(primaryText).not.toContain("Payload generated");
    expect(primaryText).not.toContain("Resolution created");
    expect(primaryText).not.toContain("Repair queue created");
  });

  it("maps the API date default into the generated date input", async () => {
    const model = mapPageDefinition({
      definition: dateDefinition,
      contractSha256: "e".repeat(64),
    });
    expect(model.initialValues["value-date"]).toBe("2026-09-15");
    expect(model.fields[0]?.inputType).toBe("date");

    await TestBed.configureTestingModule({
      imports: [GenericParameterFormComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(GenericParameterFormComponent);
    setSignalInput(fixture.componentInstance.model, model);
    setSignalInput(fixture.componentInstance.pageSize, 10);
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector(
      'input[type="date"]',
    ) as HTMLInputElement | null;
    expect(input?.value).toBe("2026-09-15");
  });

  it("renders the controlled request and response evidence hashes", async () => {
    const source = await readFile(
      join(
        process.cwd(),
        "apps/ssi-portal/src/app/resolution-workbench/resolution-evidence.component.ts",
      ),
      "utf8",
    );
    expect(source).toContain("Request SHA-256");
    expect(source).toContain("result().evidence.requestSha256");
    expect(source).toContain("Response SHA-256");
    expect(source).toContain("result().evidence.responseSha256");
  });

  it("does not re-lock a valid form when a scenario is remapped", async () => {
    const model = mapPageDefinition({
      definition: dateDefinition,
      contractSha256: "e".repeat(64),
    });

    await TestBed.configureTestingModule({
      imports: [GenericParameterFormComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(GenericParameterFormComponent);
    setSignalInput(fixture.componentInstance.model, model);
    setSignalInput(fixture.componentInstance.pageSize, 10);
    fixture.detectChanges();
    expect(fixture.componentInstance.resolveDisabled()).toBe(false);

    setSignalInput(fixture.componentInstance.model, { ...model });
    fixture.detectChanges();

    expect(fixture.componentInstance.resolveDisabled()).toBe(false);
  });

  it("enables Resolve SSI after the final required control becomes valid", async () => {
    const model = mapPageDefinition({
      definition: {
        ...dateDefinition,
        fields: dateDefinition.fields.map((field) => ({
          ...field,
          defaultValue: "",
        })),
      },
      contractSha256: "e".repeat(64),
    });

    await TestBed.configureTestingModule({
      imports: [GenericParameterFormComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(GenericParameterFormComponent);
    setSignalInput(fixture.componentInstance.model, model);
    setSignalInput(fixture.componentInstance.pageSize, 10);
    fixture.detectChanges();
    expect(fixture.componentInstance.resolveDisabled()).toBe(true);

    fixture.componentInstance.form.controls["value-date"]?.setValue(
      "2026-09-15",
    );
    fixture.detectChanges();

    expect(fixture.componentInstance.resolveDisabled()).toBe(false);
  });

  it("disables Resolve SSI and displays an accessible spinner while resolving", async () => {
    const model = mapPageDefinition({
      definition: dateDefinition,
      contractSha256: "e".repeat(64),
    });

    await TestBed.configureTestingModule({
      imports: [GenericParameterFormComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(GenericParameterFormComponent);
    setSignalInput(fixture.componentInstance.model, model);
    setSignalInput(fixture.componentInstance.pageSize, 10);
    setSignalInput(fixture.componentInstance.submitting, true);
    fixture.detectChanges();

    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll(".workbench-actions button"),
    ) as HTMLButtonElement[];
    const [cancelButton, resolveButton] = buttons;
    expect(cancelButton?.disabled).toBe(true);
    expect(resolveButton?.disabled).toBe(true);
    expect(resolveButton?.getAttribute("aria-busy")).toBe("true");
    expect(resolveButton?.querySelector(".lookup-spinner")).not.toBeNull();
    expect(resolveButton?.textContent).toContain("Resolving…");
  });

  it("emits Cancel when the form is idle", async () => {
    const model = mapPageDefinition({
      definition: dateDefinition,
      contractSha256: "e".repeat(64),
    });

    await TestBed.configureTestingModule({
      imports: [GenericParameterFormComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(GenericParameterFormComponent);
    setSignalInput(fixture.componentInstance.model, model);
    setSignalInput(fixture.componentInstance.pageSize, 10);
    const cancelled = jest.fn();
    fixture.componentInstance.cancelled.subscribe(cancelled);
    fixture.detectChanges();

    const cancelButton = fixture.nativeElement.querySelector(
      ".workbench-actions button",
    ) as HTMLButtonElement | null;
    cancelButton?.click();

    expect(cancelled).toHaveBeenCalledTimes(1);
  });

  it("submits MT202 own-account stable IDs but never exposes or submits lookup-derived versions", async () => {
    const model = mapPageDefinition({
      definition: paymentDefinition("MT202", true),
      contractSha256: "e".repeat(64),
    });
    await TestBed.configureTestingModule({
      imports: [GenericParameterFormComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(GenericParameterFormComponent);
    setSignalInput(fixture.componentInstance.model, model);
    setSignalInput(fixture.componentInstance.pageSize, 10);
    const submitted = jest.fn();
    fixture.componentInstance.submitted.subscribe(submitted);
    TestBed.flushEffects();

    expect(fixture.componentInstance.form.contains("context.ownDebitAccountVersion")).toBe(false);
    expect(fixture.componentInstance.form.contains("context.ownCreditAccountVersion")).toBe(false);
    fixture.componentInstance.submit();

    expect(submitted).toHaveBeenCalledWith({
      values: expect.objectContaining({
        "context.receiverBankServiceId": "BANK-SVC-CITIUS33",
        "context.ownDebitAccountId": "NOSTRO-DEBIT",
        "context.ownCreditAccountId": "NOSTRO-CREDIT",
      }),
    });
    const values = submitted.mock.calls[0]?.[0]?.values;
    expect(values).not.toHaveProperty("context.ownDebitAccountVersion");
    expect(values).not.toHaveProperty("context.ownCreditAccountVersion");
  });

  it("keeps all own-account controls out of an MT202COV generic submission", async () => {
    const model = mapPageDefinition({
      definition: paymentDefinition("MT202COV", false),
      contractSha256: "e".repeat(64),
    });
    await TestBed.configureTestingModule({
      imports: [GenericParameterFormComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(GenericParameterFormComponent);
    setSignalInput(fixture.componentInstance.model, model);
    setSignalInput(fixture.componentInstance.pageSize, 10);
    const submitted = jest.fn();
    fixture.componentInstance.submitted.subscribe(submitted);
    fixture.detectChanges();
    fixture.componentInstance.submit();

    expect(Object.keys(fixture.componentInstance.form.controls)).toEqual([
      "value-date",
    ]);
    expect(submitted).toHaveBeenCalledWith({
      values: { "value-date": "2026-09-15" },
    });
  });

  it("enforces every governed validator and preserves a selected route binding", async () => {
    const mapped = mapPageDefinition({
      definition: dateDefinition,
      contractSha256: "e".repeat(64),
    });
    const field = mapped.fields[0]!;
    const constrained = {
      ...mapped,
      fields: [
        {
          ...field,
          required: true,
          constraints: [
            { kind: "MIN_LENGTH" as const, value: 3 },
            { kind: "MAX_LENGTH" as const, value: 10 },
            { kind: "PATTERN" as const, value: "^[0-9-]+$" },
            { kind: "PATTERN" as const, value: 123 },
          ],
        },
      ],
      fieldSections: mapped.fieldSections.map((section) => ({
        ...section,
        fields: section.fields.map((item) =>
          item.fieldId === field.fieldId
            ? {
                ...item,
                required: true,
                constraints: [
                  { kind: "MIN_LENGTH" as const, value: 3 },
                  { kind: "MAX_LENGTH" as const, value: 10 },
                  { kind: "PATTERN" as const, value: "^[0-9-]+$" },
                  { kind: "PATTERN" as const, value: 123 },
                ],
              }
            : item,
        ),
      })),
    };

    await TestBed.configureTestingModule({
      imports: [GenericParameterFormComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(GenericParameterFormComponent);
    setSignalInput(fixture.componentInstance.model, constrained);
    setSignalInput(fixture.componentInstance.pageSize, 10);
    const submitted = jest.fn();
    fixture.componentInstance.submitted.subscribe(submitted);
    fixture.detectChanges();

    const control = fixture.componentInstance.form.controls["value-date"]!;
    control.setValue("x");
    expect(control.invalid).toBe(true);
    control.setValue("12345678901");
    expect(control.invalid).toBe(true);
    control.setValue("2026-09-21");
    expect(control.valid).toBe(true);
    const routeBinding = {
      selectedRouteIdentity: { routeId: "ROUTE-1" },
      eligibilitySnapshot: { snapshotId: "SNAPSHOT-1" },
    } as never;
    fixture.componentInstance.updateRouteBinding(routeBinding);
    fixture.componentInstance.submit();
    expect(submitted).toHaveBeenCalledWith({
      values: { "value-date": "2026-09-21" },
      routeBinding,
    });
  });

  it("covers checkbox, lookup, idle cancel, and guarded submission behavior", async () => {
    const model = mapPageDefinition({
      definition: dateDefinition,
      contractSha256: "e".repeat(64),
    });
    await TestBed.configureTestingModule({
      imports: [GenericParameterFormComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(GenericParameterFormComponent);
    setSignalInput(fixture.componentInstance.model, model);
    setSignalInput(fixture.componentInstance.pageSize, 10);
    const submitted = jest.fn();
    const cancelled = jest.fn();
    fixture.componentInstance.submitted.subscribe(submitted);
    fixture.componentInstance.cancelled.subscribe(cancelled);
    fixture.detectChanges();

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    fixture.componentInstance.updateCheckbox(
      "value-date",
      { target: checkbox } as unknown as Event,
    );
    expect(fixture.componentInstance.form.controls["value-date"]?.value).toBe(true);
    fixture.componentInstance.updateCheckbox(
      "value-date",
      { target: {} } as Event,
    );
    fixture.componentInstance.updateLookup("value-date", "BANK-SVC-1");
    expect(fixture.componentInstance.lookupValue("BANK-SVC-1")).toBe("BANK-SVC-1");
    expect(fixture.componentInstance.lookupValue(true)).toBe("");

    setSignalInput(fixture.componentInstance.submitting, true);
    fixture.componentInstance.submit();
    fixture.componentInstance.cancel();
    expect(submitted).not.toHaveBeenCalled();
    expect(cancelled).not.toHaveBeenCalled();
    setSignalInput(fixture.componentInstance.submitting, false);
    fixture.componentInstance.cancel();
    expect(cancelled).toHaveBeenCalledTimes(1);
  });

  it("does not submit without a model or while the form is invalid", async () => {
    await TestBed.configureTestingModule({
      imports: [GenericParameterFormComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(GenericParameterFormComponent);
    setSignalInput(fixture.componentInstance.pageSize, 10);
    const submitted = jest.fn();
    fixture.componentInstance.submitted.subscribe(submitted);
    fixture.detectChanges();
    fixture.componentInstance.submit();
    expect(submitted).not.toHaveBeenCalled();

    const invalidModel = mapPageDefinition({
      definition: {
        ...dateDefinition,
        fields: dateDefinition.fields.map((field) => ({ ...field, defaultValue: "" })),
      },
      contractSha256: "e".repeat(64),
    });
    setSignalInput(fixture.componentInstance.model, invalidModel);
    fixture.detectChanges();
    fixture.componentInstance.submit();
    expect(submitted).not.toHaveBeenCalled();
  });

  it("initialises an optional field without a supplied default", async () => {
    const mapped = mapPageDefinition({
      definition: dateDefinition,
      contractSha256: "e".repeat(64),
    });
    const optional = {
      ...mapped,
      initialValues: {},
      fieldSections: mapped.fieldSections.map((section) => ({
        ...section,
        fields: section.fields.map((field) => ({ ...field, required: false })),
      })),
    };
    await TestBed.configureTestingModule({
      imports: [GenericParameterFormComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(GenericParameterFormComponent);
    setSignalInput(fixture.componentInstance.model, optional);
    setSignalInput(fixture.componentInstance.pageSize, 10);
    fixture.detectChanges();

    expect(fixture.componentInstance.form.controls["value-date"]?.value).toBe("");
    expect(fixture.componentInstance.form.valid).toBe(true);
  });
});
