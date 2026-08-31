import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { EnvironmentProviders, importProvidersFrom, Provider } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { FormlyBootstrapModule } from '@ngx-formly/bootstrap';
import { FormlyModule } from '@ngx-formly/core';
import { ProtectedMonetaryFieldComponent } from './transaction-builder/protected-monetary-field.component';
import { safeReadRetryInterceptor } from './core/http-retry/http-retry.interceptor';

export const sharedAppProviders: Array<Provider | EnvironmentProviders> = [
  provideHttpClient(withInterceptors([safeReadRetryInterceptor])),
  importProvidersFrom(
    ReactiveFormsModule,
    FormlyModule.forRoot({ types: [{ name: 'protected-monetary', component: ProtectedMonetaryFieldComponent }] }),
    FormlyBootstrapModule,
  ),
];
