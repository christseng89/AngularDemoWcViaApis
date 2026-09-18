import {
  activeTheme,
  ariaSortDirection,
  auditIndexColumns,
  localCalendarDate,
  paymentSourceLabel,
  sortDirectionIndicator,
} from "./app-presentation";

describe("App presentation primitives", () => {
  it("formats a local calendar date without UTC conversion", () => {
    expect(localCalendarDate(new Date(2026, 8, 9, 23, 30))).toBe("2026-09-09");
  });

  it("presents consumer labels without changing unknown trade-finance behavior", () => {
    expect(paymentSourceLabel("CENTRAL_PAYMENT")).toBe("Payment");
    expect(paymentSourceLabel("TREASURY")).toBe("Treasury");
    expect(paymentSourceLabel("TRADE_FINANCE")).toBe("Trade Finance");
  });

  it("presents accessible sort state and the existing visual indicator", () => {
    expect(ariaSortDirection(false, "ASC")).toBe("none");
    expect(ariaSortDirection(true, "ASC")).toBe("ascending");
    expect(ariaSortDirection(true, "DESC")).toBe("descending");
    expect(sortDirectionIndicator(false, "DESC")).toBe("");
    expect(sortDirectionIndicator(true, "ASC")).toBe("↑");
    expect(sortDirectionIndicator(true, "DESC")).toBe("↓");
  });

  it("resolves explicit and system themes", () => {
    expect(activeTheme("light", true)).toBe("light");
    expect(activeTheme("dark", false)).toBe("dark");
    expect(activeTheme("system", true)).toBe("dark");
    expect(activeTheme("system", false)).toBe("light");
  });

  it("keeps governed audit columns resource-specific", () => {
    expect(auditIndexColumns("rma").map(({ label }) => label)).toEqual([
      "Own BIC",
      "Counterparty BIC",
      "Service",
      "Direction",
      "Messages",
      "Status",
      "Version",
    ]);
    expect(auditIndexColumns("ssi").at(-1)).toEqual({
      label: "Request Type",
      path: "__requestType",
    });
  });
});
