import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from "@angular/core";
import type { ResolutionPageExecutionResult } from "@ssi/contracts";
import type { ResolutionWorkbenchViewModel } from "./parameter-model.mapper";
import { ResolutionGeneratedOutputsComponent } from "./resolution-generated-outputs.component";
import { resolutionDomainFromOutputs } from "./resolution-result.presenter";
import { ResolutionResultTableComponent } from "./resolution-result-table.component";

@Component({
  selector: "ssi-resolution-evidence",
  standalone: true,
  imports: [
    ResolutionGeneratedOutputsComponent,
    ResolutionResultTableComponent,
  ],
  template: `
    <section
      class="outcome"
      [attr.data-status]="result().outcome"
      aria-live="polite"
    >
      <div class="outcome-summary">
        <span class="eyebrow">STEP 04 · RESULT</span>
        <h2>{{ outcomeTitle() }}</h2>
        <p>{{ scenarioLabel() }}</p>
        @if (resolutionDomain()) {
          <p>
            Resolution domain: <strong>{{ resolutionDomain() }}</strong>
          </p>
        }
      </div>
      <ssi-resolution-result-table [result]="result()" />
      <ssi-resolution-generated-outputs
        [outputs]="result().outputs"
        [payloadGenerated]="result().payloadGenerated"
      />
      <details class="audit-details outcome-audit">
        <summary>Technical audit details</summary>
        <dl class="evidence-list">
          <div>
            <dt>Payload generated</dt>
            <dd>{{ result().payloadGenerated }}</dd>
          </div>
          <div>
            <dt>Resolution created</dt>
            <dd>{{ result().confirmedResolutionCreated }}</dd>
          </div>
          <div>
            <dt>Repair queue created</dt>
            <dd>{{ result().repairQueueCreated }}</dd>
          </div>
          <div>
            <dt>Outcome</dt>
            <dd>{{ result().outcome }}</dd>
          </div>
          @if (result().ssiApplicability) {
            <div>
              <dt>SSI applicability</dt>
              <dd>{{ result().ssiApplicability }}</dd>
            </div>
          }
          @if (result().resolutionOutcome) {
            <div>
              <dt>Resolution outcome</dt>
              <dd>{{ result().resolutionOutcome }}</dd>
            </div>
          }
          @if (result().routeBindingId) {
            <div>
              <dt>Route binding</dt>
              <dd>
                <code>{{ result().routeBindingId }}</code>
              </dd>
            </div>
          }
          <div>
            <dt>Scenario ID</dt>
            <dd>{{ result().scenarioId }}</dd>
          </div>
          <div>
            <dt>Fixture binding</dt>
            <dd>{{ result().fixtureBindingId }}</dd>
          </div>
          <div>
            <dt>Executor</dt>
            <dd>{{ result().evidence.executorIdentity }}</dd>
          </div>
          <div>
            <dt>Correlation</dt>
            <dd>{{ result().evidence.correlationId }}</dd>
          </div>
          <div>
            <dt>Request SHA-256</dt>
            <dd>
              <code>{{ result().evidence.requestSha256 }}</code>
            </dd>
          </div>
          <div>
            <dt>Response SHA-256</dt>
            <dd>
              <code>{{ result().evidence.responseSha256 }}</code>
            </dd>
          </div>
          @if (result().reasonCode) {
            <div>
              <dt>Reason code</dt>
              <dd>{{ result().reasonCode }}</dd>
            </div>
          }
          @for (field of result().fields; track field.fieldId) {
            <div>
              <dt>{{ field.fieldId }} · {{ field.outcome }}</dt>
              <dd>{{ field.value ?? field.reasonCode ?? "—" }}</dd>
            </div>
          }
        </dl>
      </details>
    </section>
  `,
  styleUrl: "./resolution-workbench.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResolutionEvidenceComponent {
  readonly result = input.required<ResolutionPageExecutionResult>();
  readonly page = input.required<ResolutionWorkbenchViewModel>();
  readonly resolutionDomain = computed(() =>
    resolutionDomainFromOutputs(this.result().outputs),
  );
  readonly scenarioLabel = computed(
    () =>
      this.page().scenarios.find(({ id }) => id === this.result().scenarioId)
        ?.label ?? "Selected scenario",
  );
  readonly outcomeTitle = computed(() => {
    const outcome = this.result().outcome;
    if (outcome === "RESOLVED") return "SSI resolved";
    if (outcome === "NOT_REQUIRED") return "SSI not required";
    if (outcome === "NO_ELIGIBLE_SSI") return "No eligible SSI found";
    if (outcome === "VALIDATION_REJECTED") return "Details need attention";
    return "SSI reference completed";
  });
}
