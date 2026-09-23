export type AmendmentDirection = 'INCREASE' | 'DECREASE';

interface DecimalParts {
  digits: bigint;
  scale: number;
}

function parseUnsignedDecimal(value: unknown): DecimalParts | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  const [whole, fraction = ''] = text.split('.');
  if (!whole || text.split('.').length > 2 || !isAsciiDigits(whole) || (text.includes('.') && !isAsciiDigits(fraction))) return null;
  return { digits: BigInt(`${whole}${fraction}`), scale: fraction.length };
}

function isAsciiDigits(value: string): boolean {
  if (!value) return false;
  for (const character of value) {
    if (character < '0' || character > '9') return false;
  }
  return true;
}

function formatDecimal(digits: bigint, scale: number): string {
  if (scale === 0) return digits.toString();
  const padded = digits.toString().padStart(scale + 1, '0');
  let formatted = `${padded.slice(0, -scale)}.${padded.slice(-scale)}`;
  while (formatted.endsWith('0')) formatted = formatted.slice(0, -1);
  return formatted.endsWith('.') ? formatted.slice(0, -1) : formatted;
}

/** Exact decimal calculation shared by the live Formly preview and submit validation. */
export function resultingTolerancePct(
  currentValue: unknown,
  changeValue: unknown,
  direction: AmendmentDirection,
): { ok: true; value: string } | { ok: false } {
  const current = parseUnsignedDecimal(currentValue ?? '0');
  const change = parseUnsignedDecimal(changeValue ?? '0');
  if (!current || !change) return { ok: false };
  const scale = Math.max(current.scale, change.scale);
  const currentDigits = current.digits * 10n ** BigInt(scale - current.scale);
  const changeDigits = change.digits * 10n ** BigInt(scale - change.scale);
  const result = direction === 'DECREASE' ? currentDigits - changeDigits : currentDigits + changeDigits;
  if (result < 0n) return { ok: false };
  return { ok: true, value: formatDecimal(result, scale) };
}

export function amendmentDirection(movementType: string | null | undefined, selectedDirection: AmendmentDirection | null): AmendmentDirection {
  if (movementType === 'AMEND_DECREASE') return 'DECREASE';
  if (movementType === 'AMEND_INCREASE') return 'INCREASE';
  return selectedDirection ?? 'INCREASE';
}
