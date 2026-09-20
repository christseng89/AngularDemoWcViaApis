import { readonlyFormFields, ssiFormModel } from "./ssi-form-presentation";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("SSI form presentation", () => {
  it("uses the same normalized model for edit and read-only views", () => {
    expect(
      ssiFormModel(
        {
          maker: "maker.revision",
          counterpartyId: "CP-ANY-JPY",
          scope: "STANDING",
          ownerParty: "HK01",
          publisherParty: "HK01",
          route: { counterpartyBic: "ANY", currency: "JPY" },
        },
        "OWN",
      ),
    ).toMatchObject({
      counterpartyId: "ANY",
      ownershipType: "OWN",
      route: { counterpartyType: "ANY_BANK", currency: "JPY" },
    });
  });

  it("preserves an internal bank counterparty id separately from its BIC", () => {
    expect(
      ssiFormModel(
        {
          maker: "maker.revision",
          counterpartyId: "CP-BOFAUS3N",
          scope: "STANDING",
          ownerParty: "BOFAUS3N",
          publisherParty: "BOFAUS3N",
          route: { counterpartyBic: "BOFAUS3N", currency: "USD" },
        },
        "COUNTERPARTY",
      ),
    ).toMatchObject({
      counterpartyId: "CP-BOFAUS3N",
      route: { counterpartyBic: "BOFAUS3N", currency: "USD" },
    });
  });

  it("turns shared field definitions into a non-interactive view", () => {
    const [field, messageTypeField] = readonlyFormFields([
      {
        key: "counterpartyId",
        props: { showPicker: true },
        fieldGroup: [{ key: "nested" }],
      },
      {
        key: "messageTypes",
        type: "multicheckbox",
      },
    ]);
    expect(field.props).toMatchObject({
      disabled: true,
      readonly: true,
      showPicker: false,
    });
    expect(field.fieldGroup?.[0].props).toMatchObject({
      disabled: true,
      readonly: true,
      showPicker: false,
    });
    expect(messageTypeField.props?.["messageTypeOperation"]).toBe("INQUIRE");
  });

  it("keeps audit and SWIFT Data views on the same governed record component", () => {
    const auditTemplate = readFileSync(
      join(__dirname, "audit-feature", "audit-route.component.html"),
      "utf8",
    );
    const swiftDataTemplate = readFileSync(
      join(__dirname, "swift-data-crud.component.html"),
      "utf8",
    );

    expect(auditTemplate).toContain("<ssi-governed-record-view");
    expect(swiftDataTemplate).toContain("<ssi-governed-record-view");
  });

  it("omits the Active badge only when the governed view requests it", () => {
    const detailTemplate = readFileSync(
      join(__dirname, "governed-record-view.component.html"),
      "utf8",
    );
    const swiftDataTemplate = readFileSync(
      join(__dirname, "swift-data-crud.component.html"),
      "utf8",
    );
    expect(detailTemplate).toContain('hideActiveStatus() && displayStatus() === "ACTIVE"');
    expect(detailTemplate).toContain('<span class="status">{{ displayStatus() }}</span>');
    expect(swiftDataTemplate).toContain('[hideActiveStatus]="resourceId() === \'rma\'"');
  });
});
