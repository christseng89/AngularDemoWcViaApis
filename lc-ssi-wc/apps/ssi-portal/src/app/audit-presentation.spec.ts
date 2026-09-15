import {
  auditPage,
  presentAuditEvent,
  sortAuditRows,
} from "./audit-presentation";

describe("audit presentation", () => {
  const rows = [
    {
      id: 2,
      ssi_id: "ssi-2",
      action: "UPDATED",
      actor: "maker.revision",
      occurred_at: "2026-09-10T02:00:00Z",
      payload: JSON.stringify({
        ssiCode: "SSI-DEMO-042",
        before: { version: 4 },
        after: { version: 5 },
        changedFields: ["version"],
        provenance: { source: "maker" },
      }),
    },
    {
      id: 1,
      record_id: "ssi-1",
      action: "ACTIVATE",
      actor: "checker.operations",
      occurred_at: "2026-09-10T01:00:00Z",
      payload: "not-json",
    },
  ] as const;

  it("creates a human title and exposes only supplied evidence", () => {
    const event = presentAuditEvent(rows[0]);

    expect(event.title).toBe("更新 SSI 資料");
    expect(event.summary).toContain("SSI-DEMO-042");
    expect(event.before).toEqual({ version: 4 });
    expect(event.changedFields).toEqual(["version"]);
  });

  it("preserves non-JSON raw payload without inventing before and after", () => {
    const event = presentAuditEvent(rows[1]);

    expect(event.rawPayload).toBe("not-json");
    expect(event.before).toBeNull();
    expect(event.after).toBeNull();
  });

  it("sorts by human title and paginates without mutating source rows", () => {
    const sorted = sortAuditRows(rows, "title", "asc");
    const titles = sorted.map((row) => presentAuditEvent(row).title);

    expect(titles).toEqual(
      [...titles].sort((left, right) =>
        left.localeCompare(right, undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      ),
    );
    expect(auditPage(sorted, 2, 1)).toEqual([sorted[1]]);
    expect(rows[0].id).toBe(2);
  });
});
