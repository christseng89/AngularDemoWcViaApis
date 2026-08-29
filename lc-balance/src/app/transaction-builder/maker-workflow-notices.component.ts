import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-maker-workflow-notices',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './maker-workflow-notices.component.html',
  styleUrl: './maker-workflow-notices.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MakerWorkflowNoticesComponent {
  @Input() releaseSuccessHint: string | null = null;
  @Input() fixPendingMode = false;
  @Input() deletePendingReviewMode = false;
  @Input() functionCode: string | null = null;
  @Input() movementId: string | null = null;
}
