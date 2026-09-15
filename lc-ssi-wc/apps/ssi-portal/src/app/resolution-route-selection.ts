export interface ResolutionRouteChoice {
  readonly ssiId: string;
}

export interface ResolutionRouteSet {
  readonly recommendedRoute?: ResolutionRouteChoice;
  readonly alternatives: readonly ResolutionRouteChoice[];
}

export function hasManualRouteOverride(
  result: ResolutionRouteSet | null,
  selectedSsiId: string,
): boolean {
  return Boolean(
    result?.recommendedRoute &&
      result.alternatives.length > 0 &&
      selectedSsiId &&
      selectedSsiId !== result.recommendedRoute.ssiId,
  );
}
