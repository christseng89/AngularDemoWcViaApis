import { computed, inject, Injectable, signal } from "@angular/core";
import type {
  ResolutionPageDefinitionEnvelope,
  ResolutionPageDefinitionQuery,
  ResolutionPageExecutionResult,
} from "@ssi/contracts";
import { firstValueFrom } from "rxjs";
import {
  RESOLUTION_PAGE_PARAMETER_CLIENT,
  type ResolutionPageParameterClient,
} from "./page-parameter.client";
import type {
  ParameterValue,
  WorkbenchFailure,
} from "./page-parameter.contract";
import {
  mapPageDefinition,
  type ResolutionWorkbenchViewModel,
} from "./parameter-model.mapper";
import type { SelectedLookupBinding } from "./parameter-form-values";

type WorkbenchPhase = "idle" | "loading" | "ready" | "submitting";

const errorCode = (error: unknown): string => {
  if (error instanceof Error && /^PAGE_[A-Z_]+$/.test(error.message))
    return error.message;
  if (typeof error !== "object" || error === null) return "UNEXPECTED_ERROR";
  const candidate = error as {
    readonly error?: {
      readonly code?: unknown;
      readonly mx?: { readonly code?: unknown; readonly reasonCode?: unknown };
      readonly mt?: { readonly code?: unknown; readonly reasonCode?: unknown };
    };
    readonly code?: unknown;
  };
  const domain = candidate.error?.mx ?? candidate.error?.mt;
  const code = candidate.error?.code ?? candidate.code ?? domain?.code;
  if (typeof code !== "string" || code.length === 0) return "UNEXPECTED_ERROR";
  const reasonCode = domain?.reasonCode;
  return typeof reasonCode === "string" && reasonCode.length > 0
    ? `${code} · ${reasonCode}`
    : code;
};

const failure = (
  title: string,
  message: string,
  error: unknown,
): WorkbenchFailure => ({
  title,
  message,
  code: errorCode(error),
  retryable: true,
});

@Injectable()
export class ResolutionWorkbenchFacade {
  private readonly client = inject<ResolutionPageParameterClient>(
    RESOLUTION_PAGE_PARAMETER_CLIENT,
  );
  private loadSequence = 0;
  private executionSequence = 0;
  private readonly envelopeState =
    signal<ResolutionPageDefinitionEnvelope | null>(null);
  private readonly phaseState = signal<WorkbenchPhase>("idle");
  private readonly modelState = signal<ResolutionWorkbenchViewModel | null>(
    null,
  );
  private readonly failureState = signal<WorkbenchFailure | null>(null);
  private readonly resultState = signal<ResolutionPageExecutionResult | null>(
    null,
  );

  readonly phase = this.phaseState.asReadonly();
  readonly model = this.modelState.asReadonly();
  readonly failure = this.failureState.asReadonly();
  readonly result = this.resultState.asReadonly();
  readonly loading = computed(() => this.phaseState() === "loading");
  readonly submitting = computed(() => this.phaseState() === "submitting");

  async load(
    query: ResolutionPageDefinitionQuery,
    selectedScenarioId?: string,
  ): Promise<void> {
    const loadSequence = ++this.loadSequence;
    this.executionSequence += 1;
    this.phaseState.set("loading");
    this.envelopeState.set(null);
    this.modelState.set(null);
    this.failureState.set(null);
    this.resultState.set(null);
    try {
      const envelope = await firstValueFrom(this.client.load(query));
      if (this.loadSequence !== loadSequence) return;
      if (
        query.businessDomain &&
        envelope.contract.businessDomain !== query.businessDomain
      )
        throw new Error("PAGE_DEFINITION_DOMAIN_MISMATCH");
      this.envelopeState.set(envelope);
      this.modelState.set(
        mapPageDefinition(
          {
            definition: envelope.contract,
            contractSha256: envelope.contractSha256,
          },
          selectedScenarioId ?? query.businessScenarioId,
        ),
      );
      this.resultState.set(null);
      this.phaseState.set("ready");
    } catch (error: unknown) {
      if (this.loadSequence !== loadSequence) return;
      this.failureState.set(
        failure(
          "Unable to load page parameters",
          "The server-provided page definition is unavailable.",
          error,
        ),
      );
      this.phaseState.set("idle");
    }
  }

  async execute(
    values: Readonly<Record<string, ParameterValue>>,
    routeBinding?: SelectedLookupBinding,
  ): Promise<void> {
    const model = this.modelState();
    if (!model || this.submitting()) return;

    this.phaseState.set("submitting");
    const executionSequence = ++this.executionSequence;
    this.failureState.set(null);
    this.resultState.set(null);
    try {
      const result = await firstValueFrom(
        this.client.execute(model.execution, {
          definitionId: model.definitionId,
          definitionVersion: model.definitionVersion,
          scenarioId: model.selectedScenarioId,
          fixtureBindingId: model.fixtureBindingId,
          contractSha256: model.contractSha256,
          ...routeBinding,
          values,
        }),
      );
      if (this.executionSequence !== executionSequence) return;
      if (
        result.definitionId !== model.definitionId ||
        result.definitionVersion !== model.definitionVersion ||
        result.scenarioId !== model.selectedScenarioId ||
        result.fixtureBindingId !== model.fixtureBindingId ||
        result.evidence.owner !== model.execution.owner ||
        result.evidence.action !== model.execution.action
      )
        throw new Error("PAGE_PARAMETER_EXECUTION_RESPONSE_MISMATCH");
      this.resultState.set(result);
    } catch (error: unknown) {
      if (this.executionSequence !== executionSequence) return;
      this.failureState.set(
        failure(
          "Request could not be completed",
          "No result was accepted. Review the error code and retry.",
          error,
        ),
      );
    } finally {
      if (this.executionSequence === executionSequence)
        this.phaseState.set("ready");
    }
  }

  dismissResult(): void {
    this.resultState.set(null);
  }
}
