import type {
  AppView,
  BicTarget,
  GovernanceTab,
  MessageFormat,
  ThemeMode,
} from "./app-view.models";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;
type Assert<Condition extends true> = Condition;

const exactTypeContracts = {
  appView: true as Assert<
    Equal<
      AppView,
      | "dashboard"
      | "maker"
      | "checker"
      | "resolver"
      | "treasury"
      | "tradefinance"
      | "swiftdata"
      | "audit"
      | "settings"
    >
  >,
  bicTarget: true as Assert<
    Equal<
      BicTarget,
      "counterpartyId" | "beneficiaryBic" | "accountWithBic" | "intermediaryBic"
    >
  >,
  governanceTab: true as Assert<
    Equal<GovernanceTab, "rma" | "entity" | "nostro" | "ssi">
  >,
  messageFormat: true as Assert<Equal<MessageFormat, "FIN_LIKE" | "MX_JSON">>,
  themeMode: true as Assert<Equal<ThemeMode, "system" | "light" | "dark">>,
};

describe("App view model contracts", () => {
  it("retains the exact extracted union types", () => {
    expect(Object.values(exactTypeContracts).every(Boolean)).toBe(true);
  });
});
