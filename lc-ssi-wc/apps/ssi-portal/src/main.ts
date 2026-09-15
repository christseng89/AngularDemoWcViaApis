import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideFormlyCore } from '@ngx-formly/core';
import { AppComponent } from './app/app.component';
import { BicInputType, NativeInputType, NativeSelectType } from './app/formly-types';

void bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(), provideZonelessChangeDetection(),
    provideFormlyCore({ types: [{ name: 'input', component: NativeInputType }, { name: 'select', component: NativeSelectType }, { name: 'bic-input', component: BicInputType }] }),
  ],
});
