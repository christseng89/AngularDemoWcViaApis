import type { ResolutionPageScenario } from "@ssi/contracts";

export const servicerRelationshipMatches = (
  policy: NonNullable<ResolutionPageScenario["servicerRelationship"]>,
  ssiBankBic: string,
  nostroServicerBic: string,
): boolean =>
  policy === "NOT_APPLICABLE" ||
  (policy === "SAME") === (ssiBankBic === nostroServicerBic);
