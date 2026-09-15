export type SettlementOutputFormat = "MT" | "MX";
export type JsonObject = Readonly<Record<string, unknown>>;

export interface Mt2ResolutionContract {
  readonly mx: JsonObject;
  readonly mt: JsonObject;
  readonly resolutionDecision?: string;
  readonly chosenRoute?: JsonObject | null;
  readonly alternatives?: readonly JsonObject[];
  readonly candidates?: readonly JsonObject[];
  readonly snapshotHash?: string;
  readonly resolutionToken?: string;
}

export interface Mt2ResolutionEvidence {
  readonly snapshotHash: string;
  readonly resolutionToken: string;
}

const FALLBACK_ERROR =
  "Resolution fail-closed：交易條件不完整或參考服務不可用。";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonBlankString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function isMt2ResolutionContract(
  value: unknown,
): value is Mt2ResolutionContract {
  return isObject(value) && isObject(value["mx"]) && isObject(value["mt"]);
}

export function mt2ResolutionContractFromError(
  value: unknown,
): Mt2ResolutionContract | undefined {
  const root = isObject(value) ? value : undefined;
  const payload = root && isObject(root["error"]) ? root["error"] : root;
  return isMt2ResolutionContract(payload) ? payload : undefined;
}

export function contractDecision(contract: Mt2ResolutionContract): string {
  return (
    nonBlankString(contract.resolutionDecision) ??
    nonBlankString(contract.mx["decision"]) ??
    nonBlankString(contract.mx["code"]) ??
    "RESOLUTION_RESULT"
  );
}

export function contractOutput(
  contract: Mt2ResolutionContract,
  format: SettlementOutputFormat,
): JsonObject {
  return format === "MT" ? contract.mt : contract.mx;
}

function contractObject(
  contract: Mt2ResolutionContract,
  key: "chosenRoute",
): JsonObject | null {
  const value = contract[key] ?? contract.mx[key];
  return isObject(value) ? value : null;
}

function contractObjects(
  contract: Mt2ResolutionContract,
  key: "alternatives" | "candidates",
): readonly JsonObject[] {
  const value = contract[key] ?? contract.mx[key];
  return Array.isArray(value) ? value.filter(isObject) : [];
}

export function contractChosenRoute(
  contract: Mt2ResolutionContract,
): JsonObject | null {
  return contractObject(contract, "chosenRoute");
}

export function contractAlternatives(
  contract: Mt2ResolutionContract,
): readonly JsonObject[] {
  return contractObjects(contract, "alternatives");
}

export function contractCandidates(
  contract: Mt2ResolutionContract,
): readonly JsonObject[] {
  return contractObjects(contract, "candidates");
}

export function contractEvidence(
  contract: Mt2ResolutionContract,
): Mt2ResolutionEvidence | null {
  const resolutionToken =
    nonBlankString(contract.resolutionToken) ??
    nonBlankString(contract.mx["resolutionToken"]);
  const snapshotHash =
    nonBlankString(contract.snapshotHash) ??
    nonBlankString(contract.mx["snapshotHash"]);
  return resolutionToken && snapshotHash
    ? { resolutionToken, snapshotHash }
    : null;
}

function errorPayload(value: unknown): Record<string, unknown> | undefined {
  if (!isObject(value)) return undefined;
  return isObject(value["error"]) ? value["error"] : value;
}

export function presentResolutionError(value: unknown): string {
  const root = isObject(value) ? value : undefined;
  const payload = errorPayload(value);
  if (!payload) return FALLBACK_ERROR;

  const mx = isObject(payload["mx"]) ? payload["mx"] : payload;
  const mt = isObject(payload["mt"]) ? payload["mt"] : undefined;
  const code = nonBlankString(mx["code"]);
  if (!code) return FALLBACK_ERROR;

  const status = root?.["status"] ?? mx["httpStatus"];
  const detail = nonBlankString(mx["detail"]);
  const reasonCode = nonBlankString(mx["reasonCode"]);
  const mtError = nonBlankString(mt?.["error"]);
  return [
    code,
    typeof status === "number" ? `HTTP ${status}` : undefined,
    reasonCode,
    detail,
    mtError ? `MT ${mtError}` : undefined,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}
