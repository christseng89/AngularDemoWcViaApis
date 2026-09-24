import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import type { ResolutionPageGeneratedOutput } from "@ssi/contracts";

@Component({
  selector: "ssi-resolution-generated-outputs",
  standalone: true,
  template: `
    @if (outputs().length > 0) {
      <section
        class="generated-outputs"
        aria-labelledby="generated-outputs-title"
      >
        <div class="resolution-results__heading">
          <div>
            <span class="eyebrow">
              {{ payloadGenerated() ? "Generated messages" : "Resolution evidence" }}
            </span>
            <h3 id="generated-outputs-title">
              {{
                payloadGenerated()
                  ? "MT and ISO 20022 outputs"
                  : "ISO 20022 SSI resolution"
              }}
            </h3>
          </div>
          <span class="result-count">{{ outputs().length }} formats</span>
        </div>
        <div class="generated-outputs__grid">
          @for (output of outputs(); track output.outputId) {
            <article
              class="generated-output"
              [attr.data-format]="output.format"
            >
              <header>
                <div>
                  <strong>{{ output.label }}</strong>
                  <small>{{ output.messageIdentity }}</small>
                </div>
                <span class="result-status">{{ output.format }}</span>
              </header>
              <pre><code>{{ serialise(output) }}</code></pre>
            </article>
          }
        </div>
      </section>
    }
  `,
  styleUrl: "./resolution-workbench.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResolutionGeneratedOutputsComponent {
  readonly outputs = input.required<readonly ResolutionPageGeneratedOutput[]>();
  readonly payloadGenerated = input(false);

  serialise(output: ResolutionPageGeneratedOutput): string {
    return JSON.stringify(output.document, null, 2);
  }
}
