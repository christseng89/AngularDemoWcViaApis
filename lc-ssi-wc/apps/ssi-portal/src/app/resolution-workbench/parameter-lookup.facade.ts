import { inject, Injectable, signal } from "@angular/core";
import type {
  PageParameterLookupEnvelope,
  PageParameterLookupMetadata,
  PageParameterLookupResult,
} from "@ssi/contracts";
import { firstValueFrom } from "rxjs";
import {
  RESOLUTION_PAGE_PARAMETER_CLIENT,
  type PageParameterLookupRequest,
  type ResolutionPageParameterClient,
} from "./page-parameter.client";

type LookupPhase = "idle" | "loading" | "ready" | "error";

export type ParameterLookupContext = Pick<
  PageParameterLookupRequest,
  "scenarioId" | "messageType" | "sequence" | "dependencyValues"
>;

const isMatchingItem = (
  metadata: PageParameterLookupMetadata,
  item: PageParameterLookupResult,
): boolean =>
  item.provider === metadata.provider &&
  item.action === metadata.action &&
  lookupItemValue(metadata, item).length > 0 &&
  item.displayValue.length > 0;

export const lookupItemValue = (
  metadata: PageParameterLookupMetadata,
  item: PageParameterLookupResult,
): string =>
  metadata.valueField === "nostroId"
    ? (item.nostroId ?? "")
    : (item.bankServiceId ?? "");

export const unselectedLookupItems = (
  items: readonly PageParameterLookupResult[],
  selected: PageParameterLookupResult | null,
): readonly PageParameterLookupResult[] =>
  selected
    ? items.filter((item) => item.bankServiceId !== selected.bankServiceId)
    : items;

const defaultSelectionFor = (
  metadata: PageParameterLookupMetadata,
  request: PageParameterLookupRequest,
  selectedId: string | undefined,
  response: PageParameterLookupEnvelope,
): string | null => {
  if (request.query || selectedId) return null;
  const configured = response.defaultSelection;
  if (configured?.valueField !== metadata.valueField) return null;
  if (
    configured.dependency.value !==
    request.dependencyValues?.[configured.dependency.fieldId]
  )
    return null;
  return response.items.some(
    (item) => lookupItemValue(metadata, item) === configured.value,
  )
    ? configured.value
    : null;
};

const lookupUnavailableMessage = (
  provider: PageParameterLookupMetadata["provider"],
): string => {
  if (provider === "SSI_COUNTERPARTY")
    return "SSI counterparty lookup is unavailable.";
  if (provider === "NOSTRO_ACCOUNT")
    return "Own-account lookup is unavailable.";
  return "Bank Service lookup is unavailable.";
};

@Injectable()
export class ParameterLookupFacade {
  private readonly client = inject<ResolutionPageParameterClient>(
    RESOLUTION_PAGE_PARAMETER_CLIENT,
  );
  private sequence = 0;
  private readonly phaseState = signal<LookupPhase>("idle");
  private readonly itemsState = signal<readonly PageParameterLookupResult[]>(
    [],
  );
  private readonly selectedState = signal<PageParameterLookupResult | null>(
    null,
  );
  private readonly defaultSelectionState = signal<string | null>(null);
  private readonly errorState = signal<string | null>(null);

  readonly phase = this.phaseState.asReadonly();
  readonly items = this.itemsState.asReadonly();
  readonly selected = this.selectedState.asReadonly();
  readonly defaultSelection = this.defaultSelectionState.asReadonly();
  readonly error = this.errorState.asReadonly();

  async search(
    metadata: PageParameterLookupMetadata,
    query: string,
    context: ParameterLookupContext = {},
  ): Promise<void> {
    await this.load(
      metadata,
      { ...context, query: query.trim() },
      undefined,
      false,
    );
  }

  async resolve(
    metadata: PageParameterLookupMetadata,
    bankServiceId: string,
    context: ParameterLookupContext = {},
  ): Promise<void> {
    if (!bankServiceId) {
      await this.load(metadata, context, undefined, true);
      return;
    }
    await this.load(
      metadata,
      metadata.provider === "SSI_COUNTERPARTY"
        ? context
        : { ...context, bankServiceId },
      bankServiceId,
      true,
    );
  }

  select(
    metadata: PageParameterLookupMetadata,
    item: PageParameterLookupResult,
  ): string {
    const value = lookupItemValue(metadata, item);
    const returnedItem = this.itemsState().find(
      (candidate) =>
        lookupItemValue(metadata, candidate) === value &&
        (metadata.valueField === "nostroId"
          ? candidate.version === item.version
          : candidate.bic === item.bic),
    );
    if (!isMatchingItem(metadata, item) || !returnedItem)
      throw new Error("PAGE_PARAMETER_LOOKUP_SELECTION_MISMATCH");
    this.selectedState.set(returnedItem);
    this.errorState.set(null);
    return lookupItemValue(metadata, returnedItem);
  }

  clear(): void {
    this.sequence += 1;
    this.phaseState.set("idle");
    this.itemsState.set([]);
    this.selectedState.set(null);
    this.defaultSelectionState.set(null);
    this.errorState.set(null);
  }

  private async load(
    metadata: PageParameterLookupMetadata,
    request: PageParameterLookupRequest,
    selectedId: string | undefined,
    invalidateSelected: boolean,
  ): Promise<void> {
    const sequence = ++this.sequence;
    // A dependency change invalidates the previous identity immediately.  Do
    // not leave a BIC/name visible while the governed context is re-resolved.
    this.phaseState.set("loading");
    this.itemsState.set([]);
    if (invalidateSelected) this.selectedState.set(null);
    this.errorState.set(null);
    this.defaultSelectionState.set(null);
    try {
      const response = await firstValueFrom(
        this.client.lookup(metadata, request),
      );
      if (sequence !== this.sequence) return;
      this.assertMatchingEnvelope(metadata, response);
      const defaultId = defaultSelectionFor(
        metadata,
        request,
        selectedId,
        response,
      );
      const selected = selectedId
        ? response.items.find(
            (item) => lookupItemValue(metadata, item) === selectedId,
          )
        : undefined;
      const defaultItem = defaultId
        ? response.items.find(
            (item) => lookupItemValue(metadata, item) === defaultId,
          )
        : undefined;
      if (selectedId && !selected)
        throw new Error("PAGE_PARAMETER_LOOKUP_IDENTITY_MISMATCH");
      this.itemsState.set(selectedId ? [] : response.items);
      if (selectedId) this.selectedState.set(selected ?? null);
      else if (defaultItem) this.selectedState.set(defaultItem);
      else if (invalidateSelected) this.selectedState.set(null);
      this.defaultSelectionState.set(defaultId);
      this.phaseState.set("ready");
    } catch {
      if (sequence !== this.sequence) return;
      this.itemsState.set([]);
      this.defaultSelectionState.set(null);
      this.phaseState.set("error");
      this.errorState.set(lookupUnavailableMessage(metadata.provider));
    }
  }

  private assertMatchingEnvelope(
    metadata: PageParameterLookupMetadata,
    response: PageParameterLookupEnvelope,
  ): void {
    if (
      response.provider !== metadata.provider ||
      response.action !== metadata.action ||
      response.items.some((item) => !isMatchingItem(metadata, item))
    )
      throw new Error("PAGE_PARAMETER_LOOKUP_RESPONSE_MISMATCH");
  }
}
