import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
} from "@angular/core";
import { DOCUMENT } from "@angular/common";
import type { ResolutionPageDefinitionQuery } from "@ssi/contracts";
import {
  GenericParameterFormComponent,
  type ParameterFormSubmission,
} from "./generic-parameter-form.component";
import { provideResolutionPageParameterClient } from "./page-parameter.client";
import { ResolutionFailureComponent } from "./resolution-failure.component";
import { ResolutionResultDialogComponent } from "./resolution-result-dialog.component";
import { ResolutionWorkbenchFacade } from "./resolution-workbench.facade";

export interface ResolutionWorkbenchSelection {
  readonly query: ResolutionPageDefinitionQuery;
  readonly selectedScenarioId: string;
}

@Component({
  selector: "ssi-resolution-workbench",
  standalone: true,
  imports: [
    GenericParameterFormComponent,
    ResolutionFailureComponent,
    ResolutionResultDialogComponent,
  ],
  providers: [
    ResolutionWorkbenchFacade,
    provideResolutionPageParameterClient(),
  ],
  templateUrl: "./resolution-workbench.component.html",
  styleUrl: "./resolution-workbench.css",
  host: {
    "(document:keydown.escape)": "cancelOnEscape()",
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResolutionWorkbenchComponent {
  private readonly facade = inject(ResolutionWorkbenchFacade);
  private readonly document = inject(DOCUMENT);
  private resultOpener: HTMLElement | null = null;
  readonly selection = input.required<ResolutionWorkbenchSelection>();
  readonly pageSize = input.required<number>();
  readonly cancelled = output<void>();
  readonly dismissed = output<void>();
  readonly model = this.facade.model;
  readonly loading = this.facade.loading;
  readonly submitting = this.facade.submitting;
  readonly failure = this.facade.failure;
  readonly result = this.facade.result;

  constructor() {
    effect(() => {
      const selection = this.selection();
      void this.facade.load(selection.query, selection.selectedScenarioId);
    });
  }

  submit(submission: ParameterFormSubmission): void {
    const activeElement = this.document.activeElement;
    this.resultOpener =
      activeElement && "focus" in activeElement
        ? (activeElement as HTMLElement)
        : null;
    void this.facade.execute(submission.values);
  }

  retry(): void {
    const selection = this.selection();
    void this.facade.load(selection.query, selection.selectedScenarioId);
  }

  closeResult(): void {
    this.facade.dismissResult();
    const opener = this.resultOpener;
    this.resultOpener = null;
    queueMicrotask(() => opener?.focus());
  }

  cancel(): void {
    if (!this.submitting()) this.cancelled.emit();
  }

  cancelOnEscape(): void {
    if (this.result()) return;
    if (!this.submitting()) this.dismissed.emit();
  }
}
