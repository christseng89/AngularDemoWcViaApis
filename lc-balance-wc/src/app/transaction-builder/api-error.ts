/**
 * The single shared HTTP-error → display-string mapping, pulled out to a standalone pure function so
 * `CheckerActionsService` can use the exact same formatting without depending on the component. The
 * component's own `describeApiError` method delegates here.
 */
export function describeApiError(err: unknown): string {
  return (err as { error?: { message?: string } })?.error?.message ?? String(err);
}
