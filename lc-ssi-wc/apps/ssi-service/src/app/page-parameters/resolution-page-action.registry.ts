import type {
  PageParameterAction,
  PageParameterValidationOwner,
} from "@ssi/contracts";

interface RegisteredPageAction {
  readonly owner: PageParameterValidationOwner;
  readonly endpoint: string;
}

const ACTIONS: Readonly<Record<PageParameterAction, RegisteredPageAction>> = {
  RESOLVE_SSI: {
    owner: "SSI_FIELD_RESOLUTION_API",
    endpoint: "/api/v1/resolution-page-definitions/execute",
  },
  PREVIEW_REFERENCE: {
    owner: "SSI_FIELD_RESOLUTION_API",
    endpoint: "/api/v1/resolution-page-definitions/execute",
  },
  VALIDATE_FIN: {
    owner: "UPSTREAM_FIN_VALIDATOR",
    endpoint: "/api/reference/upstream-fin-validations",
  },
};

export const registeredPageAction = (
  action: PageParameterAction,
): RegisteredPageAction | undefined => ACTIONS[action];
