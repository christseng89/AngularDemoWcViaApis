import { readFileSync } from "node:fs";
import { join } from "node:path";

type TestInput<T> = (() => T) & { set(value: T): void };
function testInput<T>(initial: T): TestInput<T> {
  let current = initial;
  const read = (() => current) as TestInput<T>;
  read.set = (value) => {
    current = value;
  };
  return read;
}

jest.doMock("@angular/core", () => ({
  ChangeDetectionStrategy: { OnPush: "OnPush" },
  Component:
    () =>
    <Target>(target: Target): Target =>
      target,
  input: { required: <T>() => testInput<T>(undefined as T) },
  output: <T>() => ({ emit: jest.fn((_value?: T) => undefined) }),
}));

const shellTemplate = () =>
  readFileSync(join(join(process.cwd(), "apps/ssi-portal/src/app"), "app-shell.component.html"), "utf8");

describe("AppShell presentation boundary", () => {
  it("preserves brand, scope and primary navigation order", () => {
    const template = shellTemplate();
    expect(template).toContain("Control Room<small>Prototype · SR2026</small>");
    expect(template).toContain('nav aria-label="Primary navigation"');
    expect(template).toContain("非 SWIFT 網路訊息");
    expect(
      [...template.matchAll(/\(click\)="requestNavigation\('([^']+)'\)"/g)].map(
        ([, view]) => view,
      ),
    ).toEqual([
      "swiftdata",
      "dashboard",
      "checker",
      "treasury",
      "tradefinance",
      "resolver",
      "audit",
      "settings",
    ]);
    expect(template).toContain("Checker <em>{{ checkerCount() }}</em>");
    expect(template).toContain("view() === 'dashboard' || view() === 'maker'");
  });

  it("keeps every existing heading and detail precedence", () => {
    const template = shellTemplate();
    expect(template).toContain("@if (detailOpen())");
    for (const heading of [
      "SSI 唯讀檢視",
      "SSI 維護總覽",
      "新增／修訂 SSI",
      "四眼審批",
      "SSI Resolution",
      "Treasury SSI Resolution",
      "Trade Finance SSI Resolution",
      "SWIFT Data Service",
      "稽核軌跡",
      "Settings",
    ]) {
      expect(template).toContain(heading);
    }
    expect(template).toContain(
      '!detailOpen() && !auditDetailOpen() && view() !== "swiftdata"',
    );
    expect(template).toContain('(click)="requestRefresh()"');
  });

  it("keeps the same layout landmarks with a projected feature slot", () => {
    const template = shellTemplate();
    expect(template).toContain('<div class="shell">');
    expect(template).toContain("<aside>");
    expect(template).toContain("<main>");
    expect(template).toContain("<header>");
    expect(template).toContain("<ng-content />");
    expect(template.indexOf("<ng-content />")).toBeGreaterThan(
      template.indexOf("</header>"),
    );
  });

  it("emits typed intent and does not own navigation state", async () => {
    const { AppShellComponent } = await import("../../app/app-shell.component");
    const shell = new AppShellComponent();

    shell.requestNavigation("checker");
    shell.requestRefresh();

    expect(shell.navigationRequested.emit).toHaveBeenCalledWith("checker");
    expect(shell.refreshRequested.emit).toHaveBeenCalledTimes(1);
  });
});
