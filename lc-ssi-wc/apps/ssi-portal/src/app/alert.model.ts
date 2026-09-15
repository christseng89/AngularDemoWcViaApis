export type AlertSeverity = "info" | "success" | "warning" | "error";
export type AlertVariant = "inline" | "banner" | "blocking";

export interface AlertModel {
  readonly severity: AlertSeverity;
  readonly title: string;
  readonly message: string;
  readonly impact?: string;
  readonly code?: string;
}

export const alertRole = (severity: AlertSeverity): "alert" | "status" =>
  severity === "error" ? "alert" : "status";

export const alertIcon = (severity: AlertSeverity): string => ({
  error: "!",
  warning: "△",
  success: "✓",
  info: "i",
})[severity];
