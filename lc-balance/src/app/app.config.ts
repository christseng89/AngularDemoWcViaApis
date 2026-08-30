import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { ReactiveFormsModule } from '@angular/forms';
import { FormlyModule } from '@ngx-formly/core';
import { FormlyBootstrapModule } from '@ngx-formly/bootstrap';
import { routes } from './app.routes';
import { ProtectedMonetaryFieldComponent } from './transaction-builder/protected-monetary-field.component';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(),
    importProvidersFrom(
      ReactiveFormsModule,
      FormlyModule.forRoot({ types: [{ name: 'protected-monetary', component: ProtectedMonetaryFieldComponent }] }),
      FormlyBootstrapModule,
    ),
  ],
};
