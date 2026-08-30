import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UiMessage } from './ui-message.model';

@Component({
  selector: 'app-feedback-message',
  imports: [CommonModule],
  templateUrl: './feedback-message.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedbackMessageComponent {
  @Input({ required: true }) message!: UiMessage;
  @Output() retry = new EventEmitter<void>();

  get ariaRole(): 'alert' | 'status' {
    return this.message.severity === 'ERROR' || this.message.severity === 'WARNING' ? 'alert' : 'status';
  }

  get ariaLive(): 'assertive' | 'polite' {
    return this.message.severity === 'ERROR' ? 'assertive' : 'polite';
  }
}
