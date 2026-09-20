import { readFileSync } from "node:fs";

const globalStyles = readFileSync("apps/ssi-portal/src/styles.css", "utf8");
const formlyTypes = readFileSync("apps/ssi-portal/src/app/formly-types.ts", "utf8");
const featureStyles = [
  "apps/ssi-portal/src/app/bank-service-picker-dialog.component.css",
  "apps/ssi-portal/src/app/settings-page.component.css",
  "apps/ssi-portal/src/app/swift-data-crud.component.css",
  "apps/ssi-portal/src/app/resolution-workbench/resolution-workbench.css",
].map((path) => ({ path, css: readFileSync(path, "utf8") }));

describe("portal visual design system", () => {
  it("defines shared semantic tokens for both themes", () => {
    const light = globalStyles.match(/:root\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    const dark = globalStyles.match(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    for (const token of [
      "--ui-page",
      "--ui-surface",
      "--ui-surface-raised",
      "--ui-control",
      "--ui-border",
      "--ui-text",
      "--ui-text-muted",
      "--ui-focus",
      "--ui-action",
      "--ui-action-text",
      "--ui-row-hover",
    ]) {
      expect(light).toContain(`${token}:`);
      expect(dark).toContain(`${token}:`);
    }
  });

  it("keeps component styles free of independent color palettes", () => {
    for (const { path, css } of featureStyles) {
      expect({ path, color: css.match(/#[\da-fA-F]{3,8}\b/)?.[0] }).toEqual({
        path,
        color: undefined,
      });
      expect(css.includes('data-theme="dark"')).toBe(false);
      expect({ path, selector: css.match(/^\s*(?:button|input|select|table|th|td)\s*(?:,|\{)/m)?.[0] }).toEqual({
        path,
        selector: undefined,
      });
    }
  });

  it("provides shared component primitives in the global stylesheet", () => {
    for (const selector of [
      ".primary",
      ".ghost",
      ".field input",
      "table",
      ".catalog-tabs button",
      ".status",
      ".app-alert",
      ".bic-dialog",
      ".index-search input",
      ".pager",
      ".catalog-loading",
      ".empty",
    ]) {
      expect(globalStyles).toContain(selector);
    }
  });

  it("keeps the Message Type picker palette in the one global stylesheet", () => {
    expect(formlyTypes).not.toMatch(/\bstyles:\s*\[/);
    expect(globalStyles).toContain(".message-type-field");
    expect(globalStyles).toContain(".message-type-backdrop");
  });

  it("uses readable text and focus tokens for Message Type dialog actions", () => {
    expect(globalStyles).toMatch(/\.message-type-field \.close\s*\{[^}]*color:\s*var\(--ui-text\)/);
    expect(globalStyles).toMatch(/\.message-type-field \.close:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--ui-focus\)/);
    expect(globalStyles).toMatch(/\.message-type-field \.message-type-tabs button\.active\s*\{[^}]*color:\s*var\(--ui-text\)/);
  });

  it("uses the shared Index surface and row rhythm for Resolution features", () => {
    expect(globalStyles).toContain("--ui-index-cell-y:");
    expect(globalStyles).toContain(
      ".definition-index-workspace:has(> .transaction-index)",
    );
    expect(globalStyles).toContain(".transaction-table :where(th, td)");
  });

  it("presents read-only request type as a status badge rather than an action", () => {
    const badge = globalStyles.match(/\.request-type-badge\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(badge).toContain("border-radius: 999px");
    expect(badge).not.toContain("min-width: 92px");
    expect(globalStyles).toMatch(/\.request-type-badge\.edit-request\s*\{[^}]*color:\s*var\(--ui-accent-ink\)/);
  });

  it("centers detail status labels vertically with the close control", () => {
    const actions = globalStyles.match(/\.readonly-page-actions\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(actions).toContain("align-items: center");
    expect(globalStyles).toMatch(/\.readonly-page-actions \.icon-button\s*\{[^}]*align-self:\s*center/);
    expect(globalStyles).toMatch(/\.readonly-page-actions \.decision-pass\s*\{[^}]*margin-bottom:\s*0/);
  });

  it("uses semantic status colors in indexes and resolution summaries", () => {
    for (const selector of [".active-status", ".currency-coverage.coverage-ok", ".scenario-status span"]) {
      const css = globalStyles.split(selector + " {")[1]?.split("}")[0] ?? "";
      expect(css).toContain("var(--alert-success-surface)");
      expect(css).toContain("var(--alert-success-text)");
    }
  });

  it("uses the shared UI font for resolution result values", () => {
    for (const selector of [".result-count", ".resolution-result-table code"]) {
      const css = globalStyles.split(selector + " {")[1]?.split("}")[0] ?? "";
      expect(css).toContain("font-family: var(--font-ui)");
    }
  });
});
