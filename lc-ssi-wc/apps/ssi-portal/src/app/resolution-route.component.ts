import {
  ChangeDetectionStrategy,
  Component,
  inject,
  viewChild,
} from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import type { PageParameterBusinessDomain } from "@ssi/contracts";
import { PageDefinitionIndexWorkspaceComponent } from "./resolution-workbench/page-definition-index-workspace.component";

@Component({
  selector: "ssi-resolution-route",
  standalone: true,
  imports: [PageDefinitionIndexWorkspaceComponent],
  template: `<ssi-page-definition-index-workspace
    [businessDomain]="businessDomain"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResolutionRouteComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly workspace = viewChild(PageDefinitionIndexWorkspaceComponent);
  readonly businessDomain = this.route.snapshot.data[
    "businessDomain"
  ] as PageParameterBusinessDomain;

  async refresh(): Promise<void> {
    await this.workspace()?.load();
  }
}
