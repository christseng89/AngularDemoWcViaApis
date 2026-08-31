export type UiMessageSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';

/** Presentation-safe feedback. Technical details stay available for logging but are not rendered as primary copy. */
export interface UiMessage {
  severity: UiMessageSeverity;
  title: string;
  message: string;
  nextAction?: string;
  retryable?: boolean;
  supportCode?: string;
  technicalCode?: string;
}
