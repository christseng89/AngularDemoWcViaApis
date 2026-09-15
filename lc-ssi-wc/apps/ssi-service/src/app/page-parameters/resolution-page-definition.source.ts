import type {
  ResolutionPageDefinition,
  ResolutionPageDefinitionQuery,
} from "@ssi/contracts";

export const RESOLUTION_PAGE_DEFINITION_SOURCE = Symbol(
  "RESOLUTION_PAGE_DEFINITION_SOURCE",
);

/**
 * Adapter boundary for governed configuration/database records.
 * Implementations must return raw contracts without UI-oriented transformation.
 */
export interface ResolutionPageDefinitionSource {
  all?(standardsRelease?: string): readonly ResolutionPageDefinition[];
  find(
    query: ResolutionPageDefinitionQuery,
  ): readonly ResolutionPageDefinition[];
}
