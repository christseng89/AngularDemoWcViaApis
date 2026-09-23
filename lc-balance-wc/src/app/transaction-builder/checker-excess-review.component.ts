import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

/**
 * Shared, presentation-only Checker screen for positive event-level Excess.
 * Every A4/A6/B4 Excess flow intentionally renders the exact same approval control. The parent remains
 * responsible for mapping that approval to the authoritative Import-waiver or Export-ABSENT command.
 */
@Component({
  selector: 'app-checker-excess-review',
  imports: [CommonModule, FormsModule],
  templateUrl: './checker-excess-review.component.html',
  styleUrl: './checker-excess-review.component.scss',
})
export class CheckerExcessReviewComponent {
  @Input() amount = '0';
  @Input() currency = '';
  @Input() approved = false;
  @Output() readonly approvedChange = new EventEmitter<boolean>();
}
