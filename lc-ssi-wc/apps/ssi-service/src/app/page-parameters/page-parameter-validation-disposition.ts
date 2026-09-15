import type {
  PageParameterCompatibleNvrOutcome,
  PageParameterRuleTaxonomy,
  PageParameterValidationOwner,
  ResolutionPageScenario,
} from "@ssi/contracts";

type LegacyValidation = {
  readonly owner: PageParameterValidationOwner;
  readonly taxonomy: PageParameterRuleTaxonomy;
  readonly nvrOutcome: PageParameterCompatibleNvrOutcome;
};

const legacyValidation = (scenario: ResolutionPageScenario): LegacyValidation =>
  scenario.validation as unknown as LegacyValidation;

export const scenarioValidationOwner = (
  scenario: ResolutionPageScenario,
): PageParameterValidationOwner =>
  scenario.validation.dispositions?.[0]?.owner ?? legacyValidation(scenario).owner;

export const scenarioValidationTaxonomy = (
  scenario: ResolutionPageScenario,
): PageParameterRuleTaxonomy =>
  scenario.validation.dispositions?.[0]?.taxonomy ??
  legacyValidation(scenario).taxonomy;

export const scenarioNvrOutcome = (
  scenario: ResolutionPageScenario,
): PageParameterCompatibleNvrOutcome =>
  scenario.validation.dispositions?.[0]?.expectedOutcome ??
  legacyValidation(scenario).nvrOutcome;
