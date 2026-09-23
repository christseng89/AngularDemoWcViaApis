import { z } from 'zod';
import { parseMonetaryAmount } from '../money';

export type ExcessAllowanceOwnerType = 'IMPORT_LC' | 'EXPORT_CONFIRMATION';

export type PbdFallbackPolicyConfig =
  | Readonly<{
      authorized: false;
      fallbackPolicyId: null;
      fallbackPolicyVersion: null;
      effectiveFrom: null;
      effectiveTo: null;
    }>
  | Readonly<{
      authorized: true;
      fallbackPolicyId: string;
      fallbackPolicyVersion: string;
      effectiveFrom: string;
      effectiveTo: string | null;
    }>;

export type PbdFallbackAuthorization =
  Readonly<{ authorized: false }> | Readonly<{ authorized: true; fallbackPolicyId: string; fallbackPolicyVersion: string }>;

export interface ExcessPolicyConfig {
  policyVersion: string;
  ownerType: ExcessAllowanceOwnerType;
  allowancePercentage: string;
  configuredMaximumUsd: string;
  fxMaxStalenessSeconds: number;
  currencyPrecisions: Readonly<Record<string, number>>;
  rateScale: number;
  roundingMode: 'ROUND_HALF_UP';
  effectiveFrom: string;
  effectiveTo: string | null;
  fallbackPolicy: 'FAIL_CLOSED';
  pbdFallbackPolicy: PbdFallbackPolicyConfig;
}

const nonNegativeMoney = z.string().refine((value) => {
  try {
    return !parseMonetaryAmount(value).isNegative();
  } catch {
    return false;
  }
}, 'must be a non-negative exact decimal string');

const configuredMaximumUsd = nonNegativeMoney.refine((value) => /^\d{1,18}(\.\d{1,2})?$/.test(value), 'must use USD precision of at most 2 decimal places');

const pbdFallbackPolicySchema = z
  .discriminatedUnion('authorized', [
    z.object({
      authorized: z.literal(false),
      fallbackPolicyId: z.null(),
      fallbackPolicyVersion: z.null(),
      effectiveFrom: z.null(),
      effectiveTo: z.null(),
    }),
    z.object({
      authorized: z.literal(true),
      fallbackPolicyId: z.string().trim().min(1),
      fallbackPolicyVersion: z.string().trim().min(1),
      effectiveFrom: z.string().datetime({ offset: true }),
      effectiveTo: z.string().datetime({ offset: true }).nullable(),
    }),
  ])
  .refine(
    (policy) => !policy.authorized || policy.effectiveTo === null || Date.parse(policy.effectiveTo) > Date.parse(policy.effectiveFrom),
    'PBD fallback policy effectiveTo must be after effectiveFrom',
  );

const policySchema = z.object({
  policyVersion: z.string().trim().min(1),
  ownerType: z.enum(['IMPORT_LC', 'EXPORT_CONFIRMATION']),
  allowancePercentage: nonNegativeMoney,
  configuredMaximumUsd,
  fxMaxStalenessSeconds: z.number().int().positive(),
  currencyPrecisions: z
    .record(z.string().regex(/^[A-Z]{3}$/), z.number().int().min(0).max(3))
    .refine((value) => value.USD === 2, 'currencyPrecisions must include USD with precision 2'),
  rateScale: z.number().int().min(1).max(10),
  roundingMode: z.literal('ROUND_HALF_UP', {
    errorMap: () => ({ message: 'roundingMode must be ROUND_HALF_UP' }),
  }),
  effectiveFrom: z.string().datetime({ offset: true }),
  effectiveTo: z.string().datetime({ offset: true }).nullable(),
  fallbackPolicy: z.literal('FAIL_CLOSED', {
    errorMap: () => ({ message: 'fallbackPolicy must be FAIL_CLOSED' }),
  }),
  pbdFallbackPolicy: pbdFallbackPolicySchema,
});

type ParsedPolicy = z.infer<typeof policySchema>;
const REQUIRED_OWNER_TYPES = ['IMPORT_LC', 'EXPORT_CONFIRMATION'] as const;

function assertRequiredOwnerTypes(policies: readonly ParsedPolicy[]): void {
  for (const ownerType of REQUIRED_OWNER_TYPES) {
    if (!policies.some((policy) => policy.ownerType === ownerType)) {
      throw new Error(`Excess policy configuration must include ${ownerType}.`);
    }
  }
}

function assertValidEffectiveRanges(policies: readonly ParsedPolicy[]): void {
  for (const policy of policies) {
    if (policy.effectiveTo !== null && Date.parse(policy.effectiveTo) <= Date.parse(policy.effectiveFrom)) {
      throw new Error(`Excess policy ${policy.policyVersion}/${policy.ownerType} effectiveTo must be after effectiveFrom.`);
    }
  }
}

function assertOwnerTimeline(policies: readonly ParsedPolicy[], ownerType: ExcessAllowanceOwnerType): void {
  const ordered = policies
    .filter((policy) => policy.ownerType === ownerType)
    .sort((left, right) => Date.parse(left.effectiveFrom) - Date.parse(right.effectiveFrom));
  const versions = new Set<string>();
  for (const policy of ordered) {
    if (versions.has(policy.policyVersion)) throw new Error(`policyVersion must be unique within ${ownerType}: ${policy.policyVersion}.`);
    versions.add(policy.policyVersion);
  }
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]!;
    const current = ordered[index]!;
    if (previous.effectiveTo === null || Date.parse(current.effectiveFrom) < Date.parse(previous.effectiveTo)) {
      throw new Error(`Excess policy has overlapping intervals for ${ownerType}: ${previous.policyVersion} and ${current.policyVersion}.`);
    }
  }
}

export function loadExcessPolicyConfig(rawJson: string): readonly Readonly<ExcessPolicyConfig>[] {
  let decoded: unknown;
  try {
    decoded = JSON.parse(rawJson);
  } catch {
    throw new Error('Excess policy configuration must be valid JSON.');
  }
  const policies = z.array(policySchema).min(1).parse(decoded);

  assertRequiredOwnerTypes(policies);
  assertValidEffectiveRanges(policies);
  for (const ownerType of REQUIRED_OWNER_TYPES) assertOwnerTimeline(policies, ownerType);

  return Object.freeze(
    policies.map((policy) =>
      Object.freeze({
        ...policy,
        currencyPrecisions: Object.freeze({ ...policy.currencyPrecisions }),
        pbdFallbackPolicy: Object.freeze({ ...policy.pbdFallbackPolicy }),
      }),
    ),
  );
}

export function resolveExcessPolicy(
  policies: readonly Readonly<ExcessPolicyConfig>[],
  ownerType: ExcessAllowanceOwnerType,
  decisionTime: string,
): Readonly<ExcessPolicyConfig> {
  const at = Date.parse(decisionTime);
  if (!Number.isFinite(at)) throw new Error('decisionTime must be an ISO date-time.');
  const matches = policies.filter(
    (policy) =>
      policy.ownerType === ownerType && Date.parse(policy.effectiveFrom) <= at && (policy.effectiveTo === null || at < Date.parse(policy.effectiveTo)),
  );
  if (matches.length !== 1) throw new Error(`Expected exactly one effective Excess policy for ${ownerType}, found ${matches.length}.`);
  return matches[0]!;
}

export function resolvePbdFallbackAuthorization(policy: Readonly<ExcessPolicyConfig>, decisionTime: string): PbdFallbackAuthorization {
  const at = Date.parse(decisionTime);
  if (!Number.isFinite(at)) throw new Error('decisionTime must be an ISO date-time.');
  const fallback = policy.pbdFallbackPolicy;
  if (!fallback.authorized) return Object.freeze({ authorized: false });
  if (at < Date.parse(fallback.effectiveFrom) || (fallback.effectiveTo !== null && at >= Date.parse(fallback.effectiveTo))) {
    return Object.freeze({ authorized: false });
  }
  return Object.freeze({
    authorized: true,
    fallbackPolicyId: fallback.fallbackPolicyId,
    fallbackPolicyVersion: fallback.fallbackPolicyVersion,
  });
}
