/**
 * 2026-08-20 (reviewer-directed discriminated-union conversion of the domain sufficiency-check result
 * types) — `expect(result.ok).toBe(false)` doesn't narrow `result`'s own type for TypeScript (Jest's
 * `expect()` is opaque to the compiler), so a following `result.error` access still fails to compile
 * even after the runtime assertion. This is a TS assertion function narrowing the type for real.
 */
export function assertFailed<T extends { ok: boolean }>(result: T): asserts result is Extract<T, { ok: false }> {
  if (result.ok) throw new Error('Expected a failure result (ok: false), got ok: true.');
}

/** Mirror of assertFailed() — narrows the other direction, for a result expected to be `ok: true`. */
export function assertSucceeded<T extends { ok: boolean }>(result: T): asserts result is Extract<T, { ok: true }> {
  if (!result.ok) throw new Error('Expected a success result (ok: true), got ok: false.');
}
