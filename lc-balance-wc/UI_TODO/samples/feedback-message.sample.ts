// Design sample only — not imported by the application.
export type UiMessageSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';

export interface UiMessage {
  severity: UiMessageSeverity;
  title: string;
  message: string;
  nextAction?: string;
  retryable: boolean;
  supportCode?: string;
  technicalCode?: string;
}

export interface ApiErrorLike {
  status?: number;
  error?: { code?: string; message?: string };
}

export function presentApiError(error: ApiErrorLike, context: 'SEARCH' | 'SUBMIT' | 'APPROVE' | 'REJECT'): UiMessage {
  const code = error.error?.code ?? error.error?.message;

  if (error.status === 404 && context === 'SEARCH') {
    return {
      severity: 'INFO',
      title: 'No matching transaction',
      message: 'No transaction matched your search.',
      nextAction: 'Check the reference and search again.',
      retryable: false,
      technicalCode: code,
    };
  }

  if (code === 'NATURAL_KEY_ALREADY_EXISTS') {
    return {
      severity: 'WARNING',
      title: 'Transaction already exists',
      message: 'A transaction with this reference already exists.',
      nextAction: 'Search for the existing transaction before submitting again.',
      retryable: false,
      technicalCode: code,
    };
  }

  if (error.status === 0) {
    return {
      severity: 'ERROR',
      title: 'Balance service unavailable',
      message: 'The request was not completed, but your input has been kept.',
      nextAction: 'Check the connection and try again.',
      retryable: true,
      technicalCode: code,
    };
  }

  return {
    severity: 'ERROR',
    title: `Unable to ${context.toLowerCase()} transaction`,
    message: 'The request could not be completed. Your input has been kept.',
    nextAction: 'Try again or contact support if the problem continues.',
    retryable: true,
    supportCode: 'BAL-UI-UNEXPECTED',
    technicalCode: code,
  };
}

/*
Suggested Angular component API:

@Input({ required: true }) message!: UiMessage;
@Output() retry = new EventEmitter<void>();

get ariaRole(): 'alert' | 'status' {
  return this.message.severity === 'ERROR' || this.message.severity === 'WARNING' ? 'alert' : 'status';
}
*/
