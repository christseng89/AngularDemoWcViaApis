/** @jest-environment jsdom */

type TestSignal<T> = (() => T) & { set(value: T): void };

const testSignal = <T>(initial: T): TestSignal<T> => {
  let value = initial;
  const read = (() => value) as TestSignal<T>;
  read.set = (next) => {
    value = next;
  };
  return read;
};

jest.mock("@angular/core", () => ({
  ChangeDetectionStrategy: { OnPush: "OnPush" },
  Component:
    () =>
    <T>(target: T): T =>
      target,
  input: Object.assign(<T>(value: T) => testSignal(value), {
    required: <T>() => testSignal<T>(undefined as T),
  }),
}));

import type { ResolutionPageGeneratedOutput } from "@ssi/contracts";
import { ResolutionGeneratedOutputsComponent } from "../../../app/resolution-workbench/resolution-generated-outputs.component";

describe("ResolutionGeneratedOutputsComponent", () => {
  it("renders arbitrary server-described MT and ISO 20022 documents without converting them", () => {
    const outputs: readonly ResolutionPageGeneratedOutput[] = [
      {
        outputId: "mt",
        format: "SWIFT_MT",
        label: "MT202",
        messageIdentity: "MT202",
        mediaType: "application/json",
        document: { tags: { "53A": "CITIUS33" } },
      },
      {
        outputId: "mx",
        format: "ISO_20022",
        label: "pacs.009.001.08",
        messageIdentity: "pacs.009.001.08",
        mediaType: "application/json",
        document: { canonicalRoles: { debtorAgent: "CITIUS33" } },
      },
    ];
    const component = new ResolutionGeneratedOutputsComponent();
    (
      component.outputs as TestSignal<readonly ResolutionPageGeneratedOutput[]>
    ).set(outputs);

    expect(component.outputs()).toBe(outputs);
    expect(component.serialise(outputs[0]!)).toBe(
      JSON.stringify(outputs[0]!.document, null, 2),
    );
    expect(component.serialise(outputs[1]!)).toContain("debtorAgent");
  });
});
