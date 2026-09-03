export type AmendmentDirection = 'INCREASE' | 'DECREASE';

interface DecimalParts {
  digits: bigint;
  scale: number;
}

function parseUnsignedDecimal(value: unknown): DecimalParts | null {
  const text = String(value ?? '').trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  return { digits: BigInt(`${whole}${fraction}`), scale: fraction.length };
}

function formatDecimal(digits: bigint, scale: number): string {
  if (scale === 0) return digits.toString();
  const padded = digits.toString().padStart(scale + 1, '0');
  return `${padded.slice(0, -scale)}.${padded.slice(-scale)}`.replace(/0+$/, '').replace(/\.$/, '');
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
