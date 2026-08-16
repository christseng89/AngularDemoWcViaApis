/**
 * BAL-003 (Checker Actions extraction, OOD/SOLID): the single shared HTTP-error → display-string
 * mapping (originally `TransactionBuilderComponent`'s own private `describeApiError`, BAL-005) pulled
 * out to a standalone pure function so `CheckerActionsService` can use the exact same formatting
 * without depending on the component. The component's own `describeApiError` method now delegates
 * here — every one of its ~30 existing call sites is untouched.
 */
export function describeApiError(err: unknown): string {
  return (err as { error?: { message?: string } })?.error?.message ?? String(err);
}
