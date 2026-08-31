import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { sharedAppProviders } from './shared-app.providers';

export const appConfig: ApplicationConfig = {
  providers: [provideRouter(routes), ...sharedAppProviders],
};
