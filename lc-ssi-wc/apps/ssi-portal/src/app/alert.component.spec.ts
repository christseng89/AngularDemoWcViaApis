type TestSignal<T> = (() => T) & { set(value: T): void };
const testSignal = <T>(initial: T): TestSignal<T> => {
  let value = initial;
  const read = (() => value) as TestSignal<T>;
  read.set = (next) => { value = next; };
  return read;
};

jest.mock("@angular/core", () => ({
  ChangeDetectionStrategy: { OnPush: "OnPush" },
  Component: () => <T>(target: T): T => target,
  computed: <T>(factory: () => T) => factory,
  input: Object.assign(<T>(value: T) => testSignal(value), {
    required: <T>() => testSignal<T>(undefined as T),
  }),
  output: () => ({ emit: jest.fn() }),
}));

describe("AlertComponent", () => {
  it("uses assertive alert semantics only for errors", async () => {
    const { alertIcon, alertRole } = await import("./alert.model");
    expect(alertRole("error")).toBe("alert");
    expect(alertIcon("error")).toBe("!");
    expect(alertRole("warning")).toBe("status");
    expect(alertIcon("warning")).toBe("△");
    expect(alertIcon("success")).toBe("✓");
    expect(alertIcon("info")).toBe("i");
  });

  it("derives the rendered role and icon from its model", async () => {
    const { AlertComponent } = await import("./alert.component");
    const component = new AlertComponent();
    component.model.set({ severity: "error", title: "Stopped", message: "Failed" });
    expect(component.liveRole()).toBe("alert");
    expect(component.icon()).toBe("!");
    component.model.set({ severity: "success", title: "Done", message: "Passed" });
    expect(component.liveRole()).toBe("status");
    expect(component.icon()).toBe("✓");
  });
});
