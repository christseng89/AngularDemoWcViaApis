import type {
  PageParameterExecution,
  ResolutionPageSubmission,
} from "@ssi/contracts";

export type ParameterValue = ResolutionPageSubmission["values"][string];

export interface PageExecutionCommand {
  readonly execution: PageParameterExecution;
  readonly submission: ResolutionPageSubmission;
}

export interface WorkbenchFailure {
  readonly title: string;
  readonly message: string;
  readonly code: string;
  readonly retryable: boolean;
}
