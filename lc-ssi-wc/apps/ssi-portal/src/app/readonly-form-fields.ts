import type { FormlyFieldConfig } from "@ngx-formly/core";

export function readonlyFormFields(
  fields: readonly FormlyFieldConfig[],
): FormlyFieldConfig[] {
  return fields.map((field) => ({
    ...field,
    props: {
      ...field.props,
      disabled: true,
      readonly: true,
      showPicker: false,
    },
    expressions: {
      ...field.expressions,
      "props.disabled": () => true,
      "props.readonly": () => true,
      "props.showPicker": () => false,
    },
    ...(field.fieldGroup
      ? { fieldGroup: readonlyFormFields(field.fieldGroup) }
      : {}),
  }));
}
