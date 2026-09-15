import { Injectable } from "@nestjs/common";
import type {
  ResolutionPageDefinition,
  ResolutionPageDefinitionQuery,
} from "@ssi/contracts";
import type { ResolutionPageDefinitionSource } from "./resolution-page-definition.source";

@Injectable()
export class CompositeResolutionPageDefinitionSource implements ResolutionPageDefinitionSource {
  constructor(
    private readonly sources: readonly ResolutionPageDefinitionSource[],
  ) {}

  all(standardsRelease?: string): readonly ResolutionPageDefinition[] {
    return this.unique(
      this.sources.flatMap((source) => source.all?.(standardsRelease) ?? []),
    );
  }

  find(
    query: ResolutionPageDefinitionQuery,
  ): readonly ResolutionPageDefinition[] {
    return this.unique(this.sources.flatMap((source) => source.find(query)));
  }

  private unique(
    definitions: readonly ResolutionPageDefinition[],
  ): readonly ResolutionPageDefinition[] {
    const ids = definitions.map(({ definitionId }) => definitionId);
    if (new Set(ids).size !== ids.length)
      throw new Error("DUPLICATE_RESOLUTION_PAGE_DEFINITION");
    return definitions;
  }
}
