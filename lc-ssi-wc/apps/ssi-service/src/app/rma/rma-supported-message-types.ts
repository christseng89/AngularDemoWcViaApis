import { readFileSync } from "node:fs";
import { join } from "node:path";

interface PaymentMessageIndex {
  readonly items?: readonly {
    readonly messageType?: string;
    readonly targetMessage?: string;
    readonly selectable?: boolean;
  }[];
}

interface SsiMappingManifest {
  readonly messageEvidence?: readonly {
    readonly messageType?: string;
    readonly status?: string;
  }[];
}

const DEFAULT_PARAMETER_FILE = join(
  process.cwd(),
  "parameters",
  "payment-message-index.json",
);

export function loadRmaSupportedMessageTypes(
  parameterFile = DEFAULT_PARAMETER_FILE,
  mappingManifestFile = join(
    process.cwd(),
    "parameters",
    "ssi-mappings.sr2026.manifest.json",
  ),
): string[] {
  const parsed = JSON.parse(
    readFileSync(parameterFile, "utf8"),
  ) as PaymentMessageIndex;
  const mappingManifest = JSON.parse(
    readFileSync(mappingManifestFile, "utf8"),
  ) as SsiMappingManifest;
  const supported = new Set<string>(["MT103", "pacs.008.001.12"]);
  for (const item of parsed.items ?? []) {
    if (!item.selectable) continue;
    if (item.messageType?.trim()) supported.add(item.messageType.trim());
    if (item.targetMessage?.trim()) supported.add(item.targetMessage.trim());
  }
  for (const item of mappingManifest.messageEvidence ?? []) {
    const messageType = item.messageType?.trim().toUpperCase() ?? "";
    if (/^MT[2347]\d{2}(?:COV)?$/.test(messageType) && item.status?.trim()) {
      supported.add(messageType);
    }
  }
  return [...supported];
}
