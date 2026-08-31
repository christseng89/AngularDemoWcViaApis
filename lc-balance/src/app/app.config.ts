import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ReactiveFormsModule } from '@angular/forms';
import { FormlyModule } from '@ngx-formly/core';
import { FormlyBootstrapModule } from '@ngx-formly/bootstrap';
import { routes } from './app.routes';
import { ProtectedMonetaryFieldComponent } from './transaction-builder/protected-monetary-field.component';
import { safeReadRetryInterceptor } from './core/http-retry/http-retry.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([safeReadRetryInterceptor])),
    importProvidersFrom(
      ReactiveFormsModule,
      FormlyModule.forRoot({ types: [{ name: 'protected-monetary', component: ProtectedMonetaryFieldComponent }] }),
      FormlyBootstrapModule,
    ),
  ],
};
