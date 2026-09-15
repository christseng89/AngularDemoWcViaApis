export type MessageDirection = "INCOMING" | "OUTGOING";
export type Severity = "INFO" | "WARNING" | "ERROR";

export interface Diagnostic {
  readonly code: string;
  readonly severity: Severity;
  readonly message: string;
  readonly path?: string;
}

export interface PseudoMessage {
  readonly standardsRelease: string;
  readonly messageType: string;
  readonly direction: MessageDirection;
  readonly businessFunction: string;
  readonly fields: Readonly<Record<string, string>>;
}

export interface ExtractedSsiRole {
  readonly role: string;
  readonly sourcePath: string;
  readonly value: string;
  readonly reusableCandidate: boolean;
}

export interface ExtractionResult {
  readonly message: PseudoMessage;
  readonly roles: readonly ExtractedSsiRole[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface ResolveSsiDto {
  readonly counterpartyId: string;
  readonly currency: string;
  readonly businessFunction: string;
  readonly transactionReference: string;
}

export * from "./page-parameters";
