import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  input,
  output,
  viewChild,
} from "@angular/core";
import type { ResolutionPageExecutionResult } from "@ssi/contracts";
import type { ResolutionWorkbenchViewModel } from "./parameter-model.mapper";
import { ResolutionEvidenceComponent } from "./resolution-evidence.component";

@Component({
  selector: "ssi-resolution-result-dialog",
  standalone: true,
  imports: [ResolutionEvidenceComponent],
  templateUrl: "./resolution-result-dialog.component.html",
  styleUrl: "./resolution-workbench.css",
  host: {
    class: "resolution-result-dialog-host",
    "(document:keydown.escape)": "close()",
    "(document:keydown.tab)": "retainFocus($event)",
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResolutionResultDialogComponent {
  readonly result = input.required<ResolutionPageExecutionResult>();
  readonly page = input.required<ResolutionWorkbenchViewModel>();
  readonly closed = output<void>();
  private readonly dialog = viewChild<ElementRef<HTMLElement>>("dialog");
  private readonly closeButton =
    viewChild<ElementRef<HTMLButtonElement>>("closeButton");

  constructor() {
    afterNextRender(() => this.closeButton()?.nativeElement.focus());
  }

  close(): void {
    this.closed.emit();
  }

  retainFocus(source: Event): void {
    const event = source as KeyboardEvent;
    const root = this.dialog()?.nativeElement;
    if (!root) return;
    const focusable = [
      ...root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ),
    ];
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
