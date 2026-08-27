/**
 * The single shared HTTP-error → display-string mapping, pulled out to a standalone pure function so
 * `CheckerActionsService` can use the exact same formatting without depending on the component. The
 * component's own `describeApiError` method delegates here.
 *
 * Bug fixed (2026-08-27, found live while testing Inquire Delete Pending's own LC Catalog load — a
 * transient connection-level failure, e.g. the microservice/backend not fully up yet, surfaced as a bare
 * "[object Object]" banner): `err.error?.message` only exists when the SERVER responded with a JSON error
 * body (this service's own `ApiError.toBody()` shape). A connection-level failure (server unreachable,
 * CORS, DNS) produces an `HttpErrorResponse` whose own `.error` is a plain `ProgressEvent`/`ErrorEvent`
 * with no `.message` — falling through to the old `String(err)` printed "[object Object]" because
 * `HttpErrorResponse` has no custom `toString()`. Angular's `HttpErrorResponse` DOES carry its own
 * already-human-readable `.message` field for exactly this case (e.g. "Http failure response for
 * http://localhost:4200/...: 0 Unknown Error") — checked before the final `String(err)` fallback.
 */
export function describeApiError(err: unknown): string {
  const shaped = err as { error?: { message?: string }; message?: string };
  return shaped?.error?.message ?? shaped?.message ?? String(err);
}
