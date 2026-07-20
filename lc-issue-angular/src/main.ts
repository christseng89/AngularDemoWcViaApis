// ① Register Web Components BEFORE Angular bootstraps
//    This ensures custom elements are defined when Angular renders templates
import './app/web-components/index';

import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { AppModule } from './app/app.module';

platformBrowserDynamic()
  .bootstrapModule(AppModule)
  .catch(err => console.error(err));
