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
import { AppShellComponent } from "./app-shell.component";
import type { AppView } from "./app-view.models";

const setSignalInput = (inputSignal: unknown, value: unknown): void => {
  const node = (inputSignal as Record<PropertyKey, unknown>)[SIGNAL] as {
    applyValueToInputSignal(inputNode: unknown, inputValue: unknown): void;
  };
  node.applyValueToInputSignal(node, value);
};

describe("AppShell rendered contract", () => {
  beforeAll(async () => {
    getTestBed().initTestEnvironment(
      BrowserDynamicTestingModule,
      platformBrowserDynamicTesting(),
    );
    const directory = join(process.cwd(), "apps/ssi-portal/src/app");
    await resolveComponentResources((url) =>
      readFile(join(directory, url), "utf8"),
    );
  });

  afterEach(() => TestBed.resetTestingModule());
  afterAll(() => getTestBed().resetTestEnvironment());

  const setup = async (
    view: AppView = "dashboard",
    detailOpen = false,
    auditDetailOpen = false,
  ) => {
    await TestBed.configureTestingModule({
      imports: [AppShellComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(AppShellComponent);
    setSignalInput(fixture.componentInstance.view, view);
    setSignalInput(fixture.componentInstance.checkerCount, 3);
    setSignalInput(fixture.componentInstance.detailOpen, detailOpen);
    setSignalInput(fixture.componentInstance.auditDetailOpen, auditDetailOpen);
    fixture.detectChanges();
    return fixture;
  };

  it("renders navigation, count, heading and emits navigation and refresh intent", async () => {
    const fixture = await setup();
    const root = fixture.nativeElement as HTMLElement;
    const navigation: AppView[] = [];
    let refreshes = 0;
    fixture.componentInstance.navigationRequested.subscribe((view) =>
      navigation.push(view),
    );
    fixture.componentInstance.refreshRequested.subscribe(() => refreshes++);

    expect(root.querySelector("main h1")?.textContent).toContain(
      "SSI 維護總覽",
    );
    expect(root.querySelector("nav button.active")?.textContent).toContain(
      "SSI Maintenance",
    );
    expect(root.querySelector("nav em")?.textContent).toBe("3");

    const checker = [...root.querySelectorAll("nav button")].find((button) =>
      button.textContent?.includes("Checker"),
    );
    checker?.click();
    expect(navigation).toEqual(["checker"]);

    const refresh = [...root.querySelectorAll("header button")].find((button) =>
      button.textContent?.includes("Refresh"),
    );
    refresh?.click();
    expect(refreshes).toBe(1);
  });

  it("preserves detail heading and hides refresh for detail, audit detail, and SWIFT Data", async () => {
    const fixture = await setup("dashboard", true);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector("h1")?.textContent).toContain("SSI 唯讀檢視");
    expect(root.querySelector("header button")).toBeNull();

    setSignalInput(fixture.componentInstance.detailOpen, false);
    setSignalInput(fixture.componentInstance.auditDetailOpen, true);
    fixture.detectChanges();
    expect(root.querySelector("header button")).toBeNull();

    setSignalInput(fixture.componentInstance.auditDetailOpen, false);
    setSignalInput(fixture.componentInstance.view, "swiftdata");
    fixture.detectChanges();
    expect(root.querySelector("header button")).toBeNull();
  });
});
