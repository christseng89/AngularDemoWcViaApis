export const OFFICIAL_FIELD_NAME_PENDING =
  "Official field name pending verification";

/** Never derives a human field name from an internal canonical role key. */
export function presentOfficialFieldName(
  officialFieldName: string | null | undefined,
): string {
  return officialFieldName?.trim() || OFFICIAL_FIELD_NAME_PENDING;
}
