import { provideHttpClient } from '@angular/common/http';
import { EnvironmentProviders, importProvidersFrom, Provider } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { FormlyBootstrapModule } from '@ngx-formly/bootstrap';
import { FormlyModule } from '@ngx-formly/core';
import { ProtectedMonetaryFieldComponent } from './transaction-builder/protected-monetary-field.component';

export const sharedAppProviders: Array<Provider | EnvironmentProviders> = [
  provideHttpClient(),
  importProvidersFrom(
    ReactiveFormsModule,
    FormlyModule.forRoot({ types: [{ name: 'protected-monetary', component: ProtectedMonetaryFieldComponent }] }),
    FormlyBootstrapModule,
  ),
];
