export const AMOUNT_SHORTHAND_ERROR = 'Enter a positive amount using numbers and optional h/k/m segments (for example 20.5h, 40k2k, or 1.5m2.5k).';

export type AmountShorthandResult = { ok: true; value: string } | { ok: false; error: typeof AMOUNT_SHORTHAND_ERROR };

const MAX_INPUT_LENGTH = 128;
const TERM = /(?:\d+(?:\.\d+)?|\.\d+)(?:[hHkKmM])?/y;

interface DecimalTerm {
  coefficient: bigint;
  scale: number;
}

function invalid(): AmountShorthandResult {
  return { ok: false, error: AMOUNT_SHORTHAND_ERROR };
}

function toDecimalTerm(token: string): DecimalTerm {
  const suffix = /[hHkKmM]$/.test(token) ? token.at(-1)!.toLowerCase() : '';
  const numeric = suffix ? token.slice(0, -1) : token;
  const [rawWhole, fraction = ''] = numeric.split('.');
  let coefficient = BigInt(`${rawWhole || '0'}${fraction}`);
  const multiplierPlaces = suffix === 'm' ? 6 : suffix === 'k' ? 3 : suffix === 'h' ? 2 : 0;

  if (multiplierPlaces >= fraction.length) {
    coefficient *= 10n ** BigInt(multiplierPlaces - fraction.length);
    return { coefficient, scale: 0 };
  }

  return { coefficient, scale: fraction.length - multiplierPlaces };
}

function formatCanonicalDecimal(coefficient: bigint, scale: number): string {
  if (coefficient === 0n) return '0';
  if (scale === 0) return coefficient.toString();

  const padded = coefficient.toString().padStart(scale + 1, '0');
  const splitAt = padded.length - scale;
  const whole = padded.slice(0, splitAt);
  const fraction = padded.slice(splitAt).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

/**
 * Expands additive banking shorthand into the unsigned canonical decimal string sent to the API.
 * Exact BigInt/scale arithmetic deliberately avoids binary floating-point multiplication.
 */
export function parseAmountShorthand(input: string | number | null | undefined): AmountShorthandResult {
  if (input === null || input === undefined) return invalid();
  const source = String(input);
  if (!source || source.length > MAX_INPUT_LENGTH || source.trim() !== source) return invalid();

  const terms: DecimalTerm[] = [];
  let offset = 0;
  while (offset < source.length) {
    TERM.lastIndex = offset;
    const match = TERM.exec(source);
    if (!match || match.index !== offset) return invalid();

    const token = match[0];
    offset = TERM.lastIndex;
    const hasSuffix = /[hHkKmM]$/.test(token);
    if (!hasSuffix && offset < source.length) return invalid();
    terms.push(toDecimalTerm(token));
  }

  if (!terms.length) return invalid();
  const scale = Math.max(...terms.map((term) => term.scale));
  const total = terms.reduce((sum, term) => sum + term.coefficient * 10n ** BigInt(scale - term.scale), 0n);
  return { ok: true, value: formatCanonicalDecimal(total, scale) };
}
