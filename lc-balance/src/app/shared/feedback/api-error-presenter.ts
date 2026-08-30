import { UiMessage } from './ui-message.model';

export type ApiActionContext = 'SEARCH' | 'LOAD' | 'SUBMIT' | 'APPROVE' | 'REJECT';

interface ApiErrorLike {
  status?: number;
  message?: string;
  error?: { code?: string; message?: string } | string;
}

function errorDetails(error: unknown): { status?: number; code?: string; rawMessage?: string } {
  const shaped = error as ApiErrorLike | null | undefined;
  const body = typeof shaped?.error === 'object' ? shaped.error : undefined;
  return {
    status: shaped?.status,
    code: body?.code,
    rawMessage: body?.message ?? (typeof shaped?.error === 'string' ? shaped.error : undefined) ?? shaped?.message,
  };
}

function actionLabel(context: ApiActionContext): string {
  return context === 'LOAD' ? 'load the queue' : `${context.toLowerCase()} the transaction`;
}

/** Pure transport/backend-error to user-feedback policy. Raw technical details are never primary UI copy. */
export function presentApiError(error: unknown, context: ApiActionContext, query?: string): UiMessage {
  const { status, code, rawMessage } = errorDetails(error);
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
