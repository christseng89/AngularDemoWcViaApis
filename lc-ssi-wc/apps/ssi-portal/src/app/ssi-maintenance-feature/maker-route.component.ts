import {
  ChangeDetectionStrategy,
  Component,
  inject,
  type OnInit,
} from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";
import { FormlyForm } from "@ngx-formly/core";
import { BankServicePickerDialogComponent } from "../bank-service-picker-dialog.component";
import { LoadingStateComponent } from "../loading-state.component";
import { SSI_MAKER_ROUTE_CONTEXT } from "./ssi-maker-route-context";
import { SsiMaintenanceSession } from "./ssi-maintenance-session";

@Component({
  selector: "ssi-maker-route",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    FormlyForm,
    BankServicePickerDialogComponent,
    LoadingStateComponent,
  ],
  templateUrl: "./maker-route.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MakerRouteComponent implements OnInit {
  readonly maintenanceWipPort = inject(SsiMaintenanceSession);
  readonly actions = inject(SSI_MAKER_ROUTE_CONTEXT);
  readonly maker = this.actions.maker;

  refresh(): Promise<void> {
    return this.maintenanceWipPort.load("maker");
  }

  ngOnInit(): void {
    void this.actions.load();
  }
}
