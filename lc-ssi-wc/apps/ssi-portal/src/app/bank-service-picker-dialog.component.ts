import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  input,
  output,
  viewChild,
} from "@angular/core";

export interface BankServicePickerItem {
  readonly bankServiceId: string;
  readonly bic: string;
  readonly displayValue: string;
  readonly location?: string;
  readonly standard?: string;
}

@Component({
  selector: "ssi-bank-service-picker-dialog",
  standalone: true,
  templateUrl: "./bank-service-picker-dialog.component.html",
  styleUrl: "./bank-service-picker-dialog.component.css",
  host: {
    "(document:keydown.escape)": "cancel()",
    "(document:keydown.tab)": "retainFocus($event)",
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BankServicePickerDialogComponent {
  readonly title = input("Select Bank Service");
  readonly serviceLabel = input("BANK SERVICE");
  readonly emptyMessage = input("No matching Bank Service.");
  readonly items = input.required<readonly BankServicePickerItem[]>();
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  readonly query = input("");
  readonly page = input.required<number>();
  readonly total = input.required<number>();
  readonly totalPages = input.required<number>();
  readonly selected = output<BankServicePickerItem>();
  readonly searchRequested = output<string>();
  readonly pageRequested = output<number>();
  readonly cancelled = output<void>();
  private readonly dialog = viewChild<ElementRef<HTMLElement>>("dialog");
  private readonly searchInput =
    viewChild<ElementRef<HTMLInputElement>>("searchInput");

  constructor() {
    afterNextRender(() => this.searchInput()?.nativeElement.focus());
  }

  search(value: string): void {
    this.searchRequested.emit(value.trim());
  }

  cancel(): void {
    this.cancelled.emit();
  }

  retainFocus(source: Event): void {
    const event = source as KeyboardEvent;
    const root = this.dialog()?.nativeElement;
    if (!root) return;
    const focusable = [
      ...root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
