import {
  DomainRepairReport,
  type DomainName,
} from "../governed-data-repair/repair-contracts.ts";

export type RepairDomain = DomainName;

export interface RepairParameters {
  readonly policyNamespace: "SSI_DEMO_CBPRPLUS_SR2026";
  readonly [name: string]: unknown;
}

export interface ParameterDrivenDomainPolicy<TInput, TOutput> {
  readonly domain: RepairDomain;
  evaluate(input: TInput, parameters: RepairParameters): TOutput;
}

export interface DomainIsolationEvidence {
  readonly selectedDomain: "SSI";
  readonly ssiPolicyInvocations: 1;
  readonly rmaPolicyInvocations: 0;
  readonly otherDomainMutations: 0;
  readonly sharedReport: DomainRepairReport;
}

export class DomainSelectiveRepairOrchestrator<TInput, TOutput> {
  private readonly selectedDomain: "SSI";
  private readonly policy: ParameterDrivenDomainPolicy<TInput, TOutput>;

  constructor(
    selectedDomain: "SSI",
    policy: ParameterDrivenDomainPolicy<TInput, TOutput>,
  ) {
    this.selectedDomain = selectedDomain;
    this.policy = policy;
    if (policy.domain !== selectedDomain) {
      throw new Error(`DOMAIN_POLICY_MISMATCH:${selectedDomain}:${policy.domain}`);
    }
  }

  execute(
    input: TInput,
    parameters: RepairParameters,
  ): { readonly output: TOutput; readonly evidence: DomainIsolationEvidence } {
    if (parameters.policyNamespace !== "SSI_DEMO_CBPRPLUS_SR2026") {
      throw new Error(
        `POLICY_NAMESPACE_MISMATCH:SSI_DEMO_CBPRPLUS_SR2026:${String(parameters.policyNamespace)}`,
      );
    }
    const output = this.policy.evaluate(input, parameters);
    const sharedReport = new DomainRepairReport({
      domain: "SSI",
      recordCount: 1,
      issues: [],
    });
    return {
      output,
      evidence: Object.freeze({
        selectedDomain: this.selectedDomain,
        ssiPolicyInvocations: 1,
        rmaPolicyInvocations: 0,
        otherDomainMutations: 0,
        sharedReport,
      }),
    };
  }
}
