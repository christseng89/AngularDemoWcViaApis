import {
  currentStatusLabel,
  type CurrentStatus,
} from "../../app/current-status-contract";

describe("Current Status presentation contract", () => {
  it.each<[CurrentStatus, string]>([
    ["EMPTY", ""],
    ["IN_PROGRESS", "In Progress"],
    ["DRAFTED", "Drafted"],
    ["SUPPRESSED", "Suppressed"],
  ])("renders %s as the exact governed label", (status, label) => {
    expect(currentStatusLabel(status)).toBe(label);
  });
});
