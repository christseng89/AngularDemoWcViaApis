import { bootstrapApplication } from "@angular/platform-browser";
import { provideHttpClient } from "@angular/common/http";
import { provideZonelessChangeDetection } from "@angular/core";
import { provideFormlyCore } from "@ngx-formly/core";
import { AppComponent } from "./app/app.component";
import { provideRouter } from "@angular/router";
import { APP_ROUTES } from "./app/app.routes";
import {
  BicInputType,
  MessageTypeTagsType,
  NativeInputType,
  NativeSelectType,
} from "./app/formly-types";

void bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(),
    provideZonelessChangeDetection(),
    provideRouter(APP_ROUTES),
    provideFormlyCore({
      types: [
        { name: "input", component: NativeInputType },
        { name: "select", component: NativeSelectType },
        { name: "bic-input", component: BicInputType },
        { name: "multicheckbox", component: MessageTypeTagsType },
      ],
    }),
  ],
});
