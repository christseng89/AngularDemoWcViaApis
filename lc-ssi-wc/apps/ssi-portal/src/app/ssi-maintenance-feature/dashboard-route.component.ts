import {
  ChangeDetectionStrategy,
  Component,
  inject,
  type OnInit,
} from "@angular/core";
import { LoadingStateComponent } from "../loading-state.component";
import { SsiMaintenanceSession } from "./ssi-maintenance-session";

@Component({
  selector: "ssi-dashboard-route",
  standalone: true,
  imports: [LoadingStateComponent],
  templateUrl: "./dashboard-route.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardRouteComponent implements OnInit {
  readonly session = inject(SsiMaintenanceSession);
  readonly host = this.session;
  readonly index = this.session.index;

  ngOnInit(): void {
    void this.session.load("dashboard");
  }

  refresh(): Promise<void> {
    return this.session.refreshIndex();
  }

  readonly maintenanceWipPort = this.session;
}
