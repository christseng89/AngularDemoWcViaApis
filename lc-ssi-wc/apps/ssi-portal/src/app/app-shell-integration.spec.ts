import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("AppComponent shell integration", () => {
  const template = () =>
    readFileSync(join(__dirname, "app.component.html"), "utf8");
  const component = () =>
    readFileSync(join(__dirname, "app.component.ts"), "utf8");

  it("delegates shell intent to the existing navigation and refresh handlers", () => {
    const html = template();
    expect(html).toContain("<ssi-app-shell");
    expect(html).toContain('[view]="view()"');
    expect(html).toContain('[checkerCount]="checkerCount()"');
    expect(html).toContain('[detailOpen]="!!detailTarget()"');
    expect(html).toContain('[auditDetailOpen]="!!auditDetail()"');
    expect(html).toContain('(navigationRequested)="navigate($event)"');
    expect(html).toContain('(refreshRequested)="refresh()"');
    expect(component()).toContain("AppShellComponent,");
  });

  it("keeps feature content in the parent and overlays outside the shell", () => {
    const html = template();
    const start = html.indexOf("<ssi-app-shell");
    const close = html.indexOf("</ssi-app-shell>");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(close).toBeGreaterThan(start);
    expect(html.indexOf("<ssi-alert")).toBeGreaterThan(start);
    expect(html.indexOf("<ssi-alert")).toBeLessThan(close);
    expect(html.indexOf("<ssi-swift-data-crud")).toBeLessThan(close);
    expect(html.indexOf("@if (deleteTarget(); as row)")).toBeGreaterThan(close);
  });
});
