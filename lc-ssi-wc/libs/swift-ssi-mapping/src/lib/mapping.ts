import type { Diagnostic, ExtractionResult, PseudoMessage } from '@ssi/contracts';

export interface MappingKey {
  readonly standardsRelease: string;
  readonly messageType: string;
  readonly direction: PseudoMessage['direction'];
  readonly businessFunction: string;
  readonly path: string;
  readonly option?: string;
  readonly qualifier?: string;
}

export interface SsiMapping extends MappingKey {
  readonly canonicalRole: string;
  readonly reusableCandidate: boolean;
}

const sameKey = (message: PseudoMessage, path: string, mapping: SsiMapping): boolean =>
  mapping.standardsRelease === message.standardsRelease &&
  mapping.messageType === message.messageType &&
  mapping.direction === message.direction &&
  mapping.businessFunction === message.businessFunction &&
  mapping.path === path;

export class SsiMappingEngine {
  constructor(private readonly catalogue: readonly SsiMapping[]) {}

  extract(message: PseudoMessage): ExtractionResult {
    const diagnostics: Diagnostic[] = [];
    const roles = Object.entries(message.fields).flatMap(([path, value]) => {
      const matches = this.catalogue.filter((mapping) => sameKey(message, path, mapping));
      if (matches.length === 0) {
        diagnostics.push({ code: 'UNMAPPED_SSI_FIELD', severity: 'WARNING', message: `No mapping for ${path}`, path });
        return [];
      }
      if (matches.length > 1) {
        diagnostics.push({ code: 'AMBIGUOUS_SSI_MAPPING', severity: 'ERROR', message: `Ambiguous mapping for ${path}`, path });
        return [];
      }
      const mapping = matches[0];
      return mapping ? [{ role: mapping.canonicalRole, sourcePath: path, value, reusableCandidate: mapping.reusableCandidate }] : [];
    });
    return Object.freeze({ message, roles, diagnostics });
  }

  generate(message: Omit<PseudoMessage, 'fields'>, roles: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
    const fields: Record<string, string> = {};
    for (const mapping of this.catalogue.filter((candidate) =>
      candidate.standardsRelease === message.standardsRelease && candidate.messageType === message.messageType &&
      candidate.direction === message.direction && candidate.businessFunction === message.businessFunction)) {
      const value = roles[mapping.canonicalRole];
      if (value !== undefined) fields[mapping.path] = value;
    }
    return Object.freeze(fields);
  }
}
