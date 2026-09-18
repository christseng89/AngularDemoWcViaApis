export type AppView =
  | "dashboard"
  | "maker"
  | "checker"
  | "resolver"
  | "treasury"
  | "tradefinance"
  | "swiftdata"
  | "audit"
  | "settings";

export type BicTarget =
  "counterpartyId" | "beneficiaryBic" | "accountWithBic" | "intermediaryBic";

export type MessageFormat = "FIN_LIKE" | "MX_JSON";
export type ThemeMode = "system" | "light" | "dark";
export type GovernanceTab = "rma" | "entity" | "nostro" | "ssi";
