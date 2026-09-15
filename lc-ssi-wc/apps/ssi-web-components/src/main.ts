import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { provideHttpClient } from '@angular/common/http';
import { ResolutionWidgetComponent } from './resolution-widget.component';

void createApplication({ providers: [provideHttpClient()] }).then((app) => {
  const element = createCustomElement(ResolutionWidgetComponent, { injector: app.injector });
  if (!customElements.get('ssi-resolution-widget')) customElements.define('ssi-resolution-widget', element);
});
