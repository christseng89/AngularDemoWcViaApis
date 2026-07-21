import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { BrowserModule }      from '@angular/platform-browser';
import { ReactiveFormsModule } from '@angular/forms';
import { FormlyModule }       from '@ngx-formly/core';
import { FormlyBootstrapModule } from '@ngx-formly/bootstrap';

import { AppComponent }      from './app.component';
import { LcIssueComponent }  from './features/lc-issue/lc-issue.component';
import { FormlySectionWrapperComponent } from './shared/formly/section-wrapper.component';

@NgModule({
  declarations: [AppComponent, LcIssueComponent, FormlySectionWrapperComponent],
  imports: [
    BrowserModule,
    ReactiveFormsModule,
    FormlyModule.forRoot({
      validationMessages: [
        { name: 'required', message: '此欄位必填' },
        { name: 'min',      message: (err, f) => `最小值為 ${f.props?.['min']}` },
      ],
      wrappers: [
        { name: 'section', component: FormlySectionWrapperComponent },
      ],
    }),
    FormlyBootstrapModule,
  ],
  bootstrap: [AppComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],  // ← Required for Web Components
})
export class AppModule {}
