import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MakerActionBarState, MakerActionBarView, deriveMakerActionBarView } from './maker-action-bar.policy';

const EMPTY_STATE: MakerActionBarState = {
  releasesExistingMovementInPlace: false,
  hasSelectedContract: false,
  hasSelectedPayMovement: false,
  submitting: false,
  hasSubmitResult: false,
  naturalKeyLocked: false,
  formLocked: false,
  fixPendingMode: false,
  deletePendingReviewMode: false,
  requiresEligibleTarget: false,
  submitReady: false,
  actionBusy: false,
  fixPendingSaveReady: false,
  functionCode: null,
};

@Component({
  selector: 'app-maker-action-bar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './maker-action-bar.component.html',
  styleUrl: './maker-action-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MakerActionBarComponent implements OnChanges {
  @Input() state: MakerActionBarState = EMPTY_STATE;

  @Output() submitA4 = new EventEmitter<void>();
  @Output() submitTransaction = new EventEmitter<void>();
  @Output() cancelSelection = new EventEmitter<void>();
  @Output() saveFixPending = new EventEmitter<void>();
  @Output() cancelFixPending = new EventEmitter<void>();
  @Output() confirmDeletePending = new EventEmitter<void>();
  @Output() cancelDeletePending = new EventEmitter<void>();

  view: MakerActionBarView = deriveMakerActionBarView(EMPTY_STATE);

  ngOnChanges(): void {
    this.view = deriveMakerActionBarView(this.state);
  }
}
