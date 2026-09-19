import {
  ChangeDetectionStrategy,
  Component,
  inject,
  output,
  viewChild,
} from "@angular/core";
import { SettingsPageComponent } from "./settings-page.component";
import { ThemeService } from "./theme.service";

@Component({
  selector: "ssi-settings-route",
  standalone: true,
  imports: [SettingsPageComponent],
  template: `
    <ssi-settings-page
      [theme]="themeService.theme()"
      (themeChange)="themeService.setTheme($event)"
      (dataReloaded)="dataReloaded.emit()"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsRouteComponent {
  readonly themeService = inject(ThemeService);
  readonly dataReloaded = output<void>();
  private readonly page = viewChild(SettingsPageComponent);

  async refresh(): Promise<void> {
    await this.page()?.loadRuntime();
  }
}
