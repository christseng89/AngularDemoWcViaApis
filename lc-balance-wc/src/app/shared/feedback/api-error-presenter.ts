import { UiMessage } from './ui-message.model';

export type ApiActionContext = 'SEARCH' | 'LOAD' | 'SUBMIT' | 'FIX' | 'APPROVE' | 'REJECT';

interface ApiErrorLike {
  status?: number;
  message?: string;
  error?: {
    code?: string;
    message?: string;
    guidance?: { outcome?: string; minimumRequiredIncreaseOwner?: string };
    eligibleAlternatives?: Array<{ sgNumber?: string }>;
  } | string;
}

function errorDetails(error: unknown): {
  status?: number;
  code?: string;
  rawMessage?: string;
  guidance?: { outcome?: string; minimumRequiredIncreaseOwner?: string };
  eligibleAlternatives?: Array<{ sgNumber?: string }>;
} {
  const shaped = error as ApiErrorLike | null | undefined;
  const body = typeof shaped?.error === 'object' ? shaped.error : undefined;
  return {
    status: shaped?.status,
    code: body?.code,
    rawMessage: body?.message ?? (typeof shaped?.error === 'string' ? shaped.error : undefined) ?? shaped?.message,
    guidance: body?.guidance,
    eligibleAlternatives: body?.eligibleAlternatives,
  };
}

function actionLabel(context: ApiActionContext): string {
  return context === 'LOAD' ? 'load the queue' : `${context.toLowerCase()} the transaction`;
}

function safeBusinessMessage(rawMessage?: string): string | undefined {
  const message = rawMessage?.trim();
  if (!message || message.length > 240 || /https?:\/\/|\bat\s+\S+\s*\(|\n|\r/i.test(message)) return undefined;
  return message;
}

function presentExcessLimitError(
  context: ApiActionContext,
  technicalCode: string | undefined,
  guidance?: { outcome?: string; minimumRequiredIncreaseOwner?: string },
): UiMessage {
  const minimumIncrease = guidance?.outcome === 'FINITE' ? guidance.minimumRequiredIncreaseOwner : undefined;
  let message = 'The transaction exceeds the current Excess allowance. No pending transaction or Excess reservation was created.';
  let nextAction = minimumIncrease
    ? `Minimum Required Increase: ${minimumIncrease} owner currency. Complete and approve A2/B2 Increase, then submit a new request.`
    : 'Review the required increase guidance, then submit a new request after the approved LC amount or allowance changes.';

  if (context === 'FIX') {
    message =
      'The corrected amount exceeds the current Excess allowance. The original pending transaction and Excess reservation were retained unchanged.';
    nextAction = 'Review the latest allowance and transaction facts before trying again.';
  } else if (context === 'APPROVE') {
    message =
      'The current Excess allowance no longer permits approval. The pending transaction and Excess reservation were retained.';
    nextAction = 'Review the latest allowance and transaction facts before trying again.';
  }

  return {
    severity: 'WARNING',
    title: 'Excess limit exceeded',
    message,
    nextAction,
    retryable: false,
    supportCode: 'EXCESS_LIMIT_EXCEEDED',
    technicalCode,
  };
}

function presentFxRateError(code: 'FX_RATE_UNAVAILABLE' | 'FX_RATE_STALE', context: ApiActionContext): UiMessage {
  const staleQualifier = code === 'FX_RATE_STALE' ? 'fresh ' : '';
  let message = `A qualifying ${staleQualifier}Booking Rate could not be obtained. No pending transaction or Excess reservation was created.`;
  if (context === 'FIX') {
    message = `A qualifying ${staleQualifier}Booking Rate could not be obtained. The original pending transaction and Excess reservation were retained unchanged.`;
  } else if (context === 'APPROVE') {
    message = `A qualifying ${staleQualifier}Booking Rate could not be obtained. The pending transaction and Excess reservation were retained.`;
  }

  return {
    severity: 'WARNING',
    title: code === 'FX_RATE_STALE' ? 'Booking rate is stale' : 'Booking rate unavailable',
    message,
    nextAction: 'Retry after an Approved, Effective and fresh Booking Rate is available.',
    retryable: true,
    supportCode: code,
    technicalCode: code,
  };
}

function presentHttpClientError(
  status: number,
  context: ApiActionContext,
  code: string | undefined,
  rawMessage: string | undefined,
  technicalCode: string | undefined,
): UiMessage {
  if (status === 409) {
    return {
      severity: 'WARNING',
      title: 'Transaction already processed',
      message: 'Another action has already changed this transaction.',
      nextAction: 'Refresh the queue before continuing.',
      retryable: true,
      technicalCode,
    };
  }

  const fixedMessages: Partial<Record<number, UiMessage>> = {
    401: {
      severity: 'ERROR',
      title: 'Authentication required',
      message: 'Your session is no longer authorized to complete this request.',
      nextAction: 'Sign in again, then resubmit the transaction.',
      retryable: false,
      supportCode: 'BAL-API-HTTP-401',
      technicalCode,
    },
    403: {
      severity: 'ERROR',
      title: 'Permission denied',
      message: 'You are not authorized to complete this transaction action.',
      nextAction: 'Check your Maker/Checker permissions or contact support.',
      retryable: false,
      supportCode: 'BAL-API-HTTP-403',
      technicalCode,
    },
    404: {
      severity: 'WARNING',
      title: 'Transaction target not found',
      message: 'The selected contract or transaction is no longer available.',
      nextAction: 'Refresh the index, select the transaction again, and resubmit.',
      retryable: false,
      supportCode: 'BAL-API-HTTP-404',
      technicalCode,
    },
  };
  const fixedMessage = fixedMessages[status];
  if (fixedMessage) return fixedMessage;

  if (status === 400 || status === 422) {
    const businessMessage = safeBusinessMessage(rawMessage);
    return {
      severity: 'WARNING',
      title: 'Transaction rejected',
      message: businessMessage ?? 'The service rejected one or more transaction details. Your input has been kept.',
      nextAction: businessMessage ? 'Correct the transaction details and submit again.' : 'Review the transaction details and submit again.',
      retryable: false,
      supportCode: code ?? `BAL-API-HTTP-${status}`,
      technicalCode,
    };
  }

  return {
    severity: 'ERROR',
    title: `Unable to ${actionLabel(context)}`,
    message: 'The request was rejected by the service. Your input has been kept.',
    nextAction: 'Review the transaction details or contact support.',
    retryable: false,
    supportCode: code ?? `BAL-API-HTTP-${status}`,
    technicalCode,
  };
}

/** Local form/rule failures are not transport failures and must never receive BAL-UI-UNEXPECTED. */
export function presentValidationError(message: string): UiMessage {
  return {
    severity: 'WARNING',
    title: 'Check transaction details',
    message,
    nextAction: 'Correct the highlighted transaction details and submit again.',
    retryable: false,
  };
}

/** Pure transport/backend-error to user-feedback policy. Raw technical details are never primary UI copy. */
export function presentApiError(error: unknown, context: ApiActionContext, query?: string): UiMessage {
  const { status, code, rawMessage, guidance, eligibleAlternatives } = errorDetails(error);
  const technicalCode = code ?? rawMessage;
  const isNotFound = status === 404 || (!!rawMessage && /not found/i.test(rawMessage));

  if (context === 'SEARCH' && isNotFound) {
    return {
      severity: 'INFO',
      title: 'No matching transaction',
      message: query?.trim() ? `No transaction matched ${query.trim()}.` : 'No transaction matched your search.',
      nextAction: 'Check the reference and search again.',
      retryable: false,
      technicalCode,
    };
  }

  if (code === 'NATURAL_KEY_ALREADY_EXISTS' || rawMessage === 'NATURAL_KEY_ALREADY_EXISTS') {
    return {
      severity: 'WARNING',
      title: 'Transaction already exists',
      message: 'A transaction with this reference already exists.',
      nextAction: 'Search for the existing transaction before submitting again.',
      retryable: false,
      technicalCode,
    };
  }

  if (code === 'A3S_RESELECT_ELIGIBLE_SG') {
    const alternatives = eligibleAlternatives?.map((candidate) => candidate.sgNumber).filter(Boolean).join(', ');
    return {
      severity: 'WARNING',
      title: 'Re-select Eligible SG',
      message: alternatives
        ? `The selected Shipping Guarantee cannot cover this arrival. Eligible alternatives: ${alternatives}.`
        : 'The selected Shipping Guarantee cannot cover this arrival.',
      nextAction: 'Re-select an Eligible SG and recalculate the Effective Presentation Capacity before submitting again.',
      retryable: false,
      supportCode: code,
      technicalCode: code,
    };
  }

  if (code === 'EXCESS_LIMIT_EXCEEDED') {
    return presentExcessLimitError(context, technicalCode, guidance);
  }

  if (code === 'FX_RATE_UNAVAILABLE' || code === 'FX_RATE_STALE') {
    return presentFxRateError(code, context);
  }

  if (code === 'APPLICANT_WAIVER_REQUIRED') {
    return {
      severity: 'WARNING',
      title: 'Applicant waiver confirmation required',
      message: 'Applicant Waiver has not been explicitly confirmed. The pending transaction and Excess reservation were retained.',
      nextAction: 'Confirm Applicant Waiver and, if available, add its audit reference before releasing again.',
      retryable: false,
      supportCode: code,
      technicalCode,
    };
  }

  if (status !== undefined && status >= 400 && status < 500) {
    return presentHttpClientError(status, context, code, rawMessage, technicalCode);
  }

  if (status === 0 || (!!rawMessage && /unknown error|failed to fetch|network/i.test(rawMessage))) {
    return {
      severity: 'ERROR',
      title: 'Balance service unavailable',
      message: 'The request was not completed, but your input has been kept.',
      nextAction: 'Check the connection and try again.',
      retryable: true,
      technicalCode,
    };
  }

  if (status !== undefined && status >= 500) {
    return {
      severity: 'ERROR',
      title: 'Balance service temporarily unavailable',
      message: 'The service could not complete the request, but your input has been kept.',
      nextAction: 'Try again. If the problem continues, check the backend and Balance microservice.',
      retryable: true,
      supportCode: `BAL-SVC-HTTP-${status}`,
      technicalCode,
    };
  }

  return {
    severity: 'ERROR',
    title: `Unable to ${actionLabel(context)}`,
    message: 'The request could not be completed. Your input has been kept.',
    nextAction: 'Try again or contact support if the problem continues.',
    retryable: true,
    supportCode: 'BAL-UI-UNEXPECTED',
    technicalCode,
  };
}
