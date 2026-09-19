import type { FormlyFieldConfig } from "@ngx-formly/core";
import type { BicTarget } from "../app-view.models";
import { ssiAccountReferenceCopy } from "../ssi-account-reference-copy";
import { BIC_PATTERN, COUNTERPARTY_ID_PATTERN } from "../fin-5x-catalog";

export function buildSsiMakerFields(
  currencies: readonly { code: string; decimals: number }[],
  openPicker: (target: BicTarget, title: string) => void,
): FormlyFieldConfig[] {
  const bicValidation = {
    required: true,
    pattern: BIC_PATTERN,
    maxLength: 11,
    minLength: 8,
  };
  return [
    {
      key: "maker",
      type: "input",
      props: {
        label: "Maker 使用者",
        required: true,
        description: "建立或修改草稿的操作人；Checker 必須為不同使用者。",
      },
    },
    {
      key: "ownershipType",
      type: "select",
      props: {
        label: "Ownership Type",
        required: true,
        options: [
          { label: "Own SSI／本行 SSI", value: "OWN" },
          { label: "Counterparty SSI／對手行 SSI", value: "COUNTERPARTY" },
        ],
      },
    },
    {
      key: "ownerParty",
      type: "input",
      props: { label: "Owner Party", required: true },
    },
    {
      key: "publisherParty",
      type: "input",
      props: { label: "Publisher Party", required: true },
    },
    {
      key: "route.counterpartyType",
      type: "select",
      props: {
        label: "Counterparty Type／交易對手類型",
        required: true,
        description:
          "SSI Maintenance 僅管理銀行間 settlement SSI；一般 Bank 使用 SWIFT BIC，通用 fallback 使用 ANY。",
        options: [
          { label: "Bank／銀行", value: "BANK" },
          {
            label: "Any approved bank／任何已核准銀行",
            value: "ANY_BANK",
          },
        ],
      },
    },
    {
      key: "counterpartyId",
      type: "bic-input",
      props: {
        label: "Counterparty ID／交易對手識別碼",
        required: true,
        placeholder: "Bank: CP-CITIUS33；通用 fallback: ANY",
        description:
          "內部穩定識別碼；Bank Service 選擇會同步保存對應的 SWIFT BIC。",
        pickerAction: () =>
          void openPicker("counterpartyId", "選擇交易對手識別碼"),
      },
      expressions: {
        "props.pattern": (field) =>
          (
            field.model as {
              route?: { counterpartyType?: "BANK" | "CUSTOMER" };
            }
          )?.route?.counterpartyType === "CUSTOMER"
            ? /^[A-Z0-9][A-Z0-9._-]{2,34}$/i
            : (
                  field.model as {
                    route?: { counterpartyType?: string };
                  }
                )?.route?.counterpartyType === "ANY_BANK"
              ? /^ANY$/
              : COUNTERPARTY_ID_PATTERN,
        "props.minLength": (field) =>
          (
            field.model as {
              route?: { counterpartyType?: "BANK" | "CUSTOMER" };
            }
          )?.route?.counterpartyType === "CUSTOMER"
            ? 3
            : (
                  field.model as {
                    route?: { counterpartyType?: string };
                  }
                )?.route?.counterpartyType === "ANY_BANK"
              ? 3
              : 3,
        "props.maxLength": (field) =>
          (
            field.model as {
              route?: { counterpartyType?: "BANK" | "CUSTOMER" };
            }
          )?.route?.counterpartyType === "CUSTOMER"
            ? 35
            : (
                  field.model as {
                    route?: { counterpartyType?: string };
                  }
                )?.route?.counterpartyType === "ANY_BANK"
              ? 3
              : 35,
        "props.validationMessage": (field) =>
          (
            field.model as {
              route?: { counterpartyType?: "BANK" | "CUSTOMER" };
            }
          )?.route?.counterpartyType === "CUSTOMER"
            ? "請輸入 3–35 字元的 Customer ID，或從 Customer Service 選擇"
            : (
                  field.model as {
                    route?: { counterpartyType?: string };
                  }
                )?.route?.counterpartyType === "ANY_BANK"
              ? "通用 fallback 固定使用 ANY；實際受款銀行由交易資料提供"
              : "請輸入 3–35 字元的內部 Counterparty ID，或從 Bank Service 選擇",
        "props.description": (field) =>
          (field.model as { route?: { counterpartyType?: string } })?.route
            ?.counterpartyType === "ANY_BANK"
            ? "通用 fallback 適用任何已核准銀行；實際交易對手由交易資料提供。"
            : "內部穩定識別碼；SWIFT BIC 另存於受控 route 資料。",
        "props.showPicker": (field) =>
          (field.model as { route?: { counterpartyType?: string } })?.route
            ?.counterpartyType !== "ANY_BANK",
        "props.readonly": (field) =>
          (field.model as { route?: { counterpartyType?: string } })?.route
            ?.counterpartyType === "ANY_BANK",
        "props.pickerLabel": (field) =>
          (
            field.model as {
              route?: { counterpartyType?: "BANK" | "CUSTOMER" };
            }
          )?.route?.counterpartyType === "CUSTOMER"
            ? "從 Customer Service 選擇"
            : "從 Bank Service 選擇",
      },
    },
    {
      key: "scope",
      type: "select",
      props: {
        label: "SSI Scope",
        required: true,
        options: [
          { label: "Standing（可重複使用）", value: "STANDING" },
          {
            label: "Transaction specific（須綁定交易）",
            value: "TRANSACTION_SPECIFIC",
          },
        ],
      },
    },
    {
      key: "route.currency",
      type: "select",
      props: {
        label: "Currency（ISO 4217）",
        description: "由 Currency 微服務提供，不接受自由輸入。",
        required: true,
        placeholder: "請選擇幣別",
        options: currencies.map(({ code, decimals }) => ({
          label: `${code} · ${decimals} decimals`,
          value: code,
        })),
      },
    },
    {
      key: "route.beneficiarySource",
      type: "select",
      props: {
        label: "Beneficiary Source",
        required: true,
        description:
          "SSI 表示 Beneficiary BIC 儲存在本 SSI；Transaction 表示由交易資料提供，SSI 不得儲存或推導。",
        options: [
          { label: "SSI／由 SSI 提供", value: "SSI" },
          { label: "Transaction／由交易提供", value: "TRANSACTION" },
        ],
      },
    },
    {
      key: "route.beneficiaryBic",
      type: "bic-input",
      props: {
        label: "Beneficiary BIC（ISO 9362）",
        pickerAction: () =>
          void openPicker("beneficiaryBic", "選擇 Beneficiary BIC"),
        pattern: BIC_PATTERN,
        maxLength: 11,
        minLength: 8,
      },
      expressions: {
        "props.required": (field) =>
          (field.model as { route?: { beneficiarySource?: string } })?.route
            ?.beneficiarySource !== "TRANSACTION",
        "props.disabled": (field) =>
          (field.model as { route?: { beneficiarySource?: string } })?.route
            ?.beneficiarySource === "TRANSACTION",
        "props.description": (field) =>
          (field.model as { route?: { beneficiarySource?: string } })?.route
            ?.beneficiarySource === "TRANSACTION"
            ? "不儲存在 SSI；由交易資料提供。"
            : "可手動輸入 BIC8/BIC11，或從 Bank Service 選擇銀行身分並回填唯讀 BIC。",
      },
    },
    {
      key: "route.accountWithBic",
      type: "bic-input",
      props: {
        label: "Account With Institution（ISO 9362）",
        description:
          "SSI 的 Account With Institution BIC；Bank Service 只提供銀行身分與 BIC，不提供帳號。",
        pickerAction: () =>
          void openPicker("accountWithBic", "選擇 Account With Institution"),
        ...bicValidation,
      },
    },
    {
      key: "route.intermediaryBic",
      type: "bic-input",
      props: {
        label: "Intermediary Institution（ISO 9362）",
        description: "選填；沒有 intermediary 時保持空白。",
        pickerAction: () =>
          void openPicker("intermediaryBic", "選擇 Intermediary Institution"),
        pattern: BIC_PATTERN,
        maxLength: 11,
      },
    },
    {
      key: "route.accountId",
      type: "input",
      expressions: {
        "props.label": (field) => {
          const model = field.model as {
            ownershipType?: "OWN" | "COUNTERPARTY";
            route?: { counterpartyType?: "BANK" | "CUSTOMER" };
          };
          return ssiAccountReferenceCopy(
            model?.ownershipType,
            model?.route?.counterpartyType,
          ).label;
        },
        "props.description": (field) => {
          const model = field.model as {
            ownershipType?: "OWN" | "COUNTERPARTY";
            route?: { counterpartyType?: "BANK" | "CUSTOMER" };
          };
          return ssiAccountReferenceCopy(
            model?.ownershipType,
            model?.route?.counterpartyType,
          ).description;
        },
        "props.placeholder": (field) => {
          const model = field.model as {
            ownershipType?: "OWN" | "COUNTERPARTY";
            route?: { counterpartyType?: "BANK" | "CUSTOMER" };
          };
          return ssiAccountReferenceCopy(
            model?.ownershipType,
            model?.route?.counterpartyType,
          ).placeholder;
        },
      },
    },
  ];
}
