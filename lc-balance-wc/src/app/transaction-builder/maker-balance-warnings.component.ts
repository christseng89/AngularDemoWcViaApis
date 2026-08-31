import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-maker-balance-warnings',
  imports: [CommonModule],
  templateUrl: './maker-balance-warnings.component.html',
  styleUrl: './maker-balance-warnings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MakerBalanceWarningsComponent {
  @Input() messages: readonly string[] = [];
}
