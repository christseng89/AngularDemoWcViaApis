export type CurrentStatus = "EMPTY" | "IN_PROGRESS" | "DRAFTED" | "SUPPRESSED";

const labels: Readonly<Record<CurrentStatus, string>> = {
  EMPTY: "",
  IN_PROGRESS: "In Progress",
  DRAFTED: "Drafted",
  SUPPRESSED: "Suppressed",
};

export function currentStatusLabel(status: CurrentStatus): string {
  return labels[status];
}
