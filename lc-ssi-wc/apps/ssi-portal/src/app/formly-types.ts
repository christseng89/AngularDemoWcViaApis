import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { FieldType, FormlyAttributes, type FieldTypeConfig } from '@ngx-formly/core';

@Component({
  selector: 'ssi-native-input', standalone: true, imports: [ReactiveFormsModule, FormlyAttributes], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<label class="field"><span>{{props.label}} @if(props.required){<b>*</b>}</span><input [type]="props.type??'text'" [formControl]="formControl" [formlyAttributes]="field" [placeholder]="props.placeholder??''"/>@if(props.description){<p>{{props.description}}</p>}@if(showError){<small>欄位內容不符合規則</small>}</label>`,
})
export class NativeInputType extends FieldType<FieldTypeConfig> {}

@Component({
  selector: 'ssi-native-select', standalone: true, imports: [ReactiveFormsModule, FormlyAttributes], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<label class="field"><span>{{props.label}} @if(props.required){<b>*</b>}</span><select [formControl]="formControl" [formlyAttributes]="field">@for(option of selectOptions;track option.value){<option [value]="option.value">{{option.label}}</option>}</select>@if(props.description){<p>{{props.description}}</p>}</label>`,
})
export class NativeSelectType extends FieldType<FieldTypeConfig> { get selectOptions(): Array<{label:string;value:unknown}> { return Array.isArray(this.props.options) ? this.props.options as Array<{label:string;value:unknown}> : []; } }

@Component({
  selector: 'ssi-bic-input', standalone: true, imports: [ReactiveFormsModule, FormlyAttributes], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<label class="field"><span>{{props.label}} @if(props.required){<b>*</b>}</span><div class="field-input-row"><input [formControl]="formControl" [formlyAttributes]="field" [placeholder]="props.placeholder??'BIC8／BIC11'"/><button type="button" class="picker-button" (click)="openPicker()">{{pickerLabel}}</button></div>@if(props.description){<p>{{props.description}}</p>}@if(showError){<small>{{validationMessage}}</small>}</label>`,
})
export class BicInputType extends FieldType<FieldTypeConfig> {
  get pickerLabel(): string {
    return (this.field.props as { pickerLabel?: string } | undefined)
      ?.pickerLabel ?? "從 Bank Service 選擇";
  }
  get validationMessage(): string {
    return (this.field.props as { validationMessage?: string } | undefined)
      ?.validationMessage ?? "請輸入符合 ISO 9362 結構的 BIC8 或 BIC11";
  }
  openPicker(): void { (this.field.props as { pickerAction?: () => void } | undefined)?.pickerAction?.(); }
}
