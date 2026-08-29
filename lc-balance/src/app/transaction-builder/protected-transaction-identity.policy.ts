export interface ProtectedIdentityState {
  lcNumber: string | null;
  secondaryRef: string | null;
  carriedSecondaryRef: string | null;
  requiredNaturalKeyFields: readonly string[];
  isCreatingMovement: boolean;
  settlesDocumentArrival: boolean;
  releasesExistingMovementInPlace: boolean;
  ibNumberLabel: string;
}

export interface ProtectedIdentityItem {
  label: string;
  value: string;
}

/** Derives protected identity rows without exposing transaction exceptions to the template. */
export function deriveProtectedIdentityItems(state: ProtectedIdentityState): ProtectedIdentityItem[] {
  const items: ProtectedIdentityItem[] = [{ label: 'LC Number', value: state.lcNumber || '—' }];

  if (state.requiredNaturalKeyFields.includes('ibNumber') && (!state.isCreatingMovement || state.settlesDocumentArrival)) {
    items.push({ label: state.ibNumberLabel, value: state.secondaryRef || '—' });
  }
  if (state.requiredNaturalKeyFields.includes('sgNumber') && !state.isCreatingMovement) {
    items.push({ label: 'SG Number', value: state.secondaryRef || '—' });
  }
  if (state.releasesExistingMovementInPlace) {
    items.push({ label: 'IB Number', value: state.carriedSecondaryRef || '—' });
  }

  return items;
}
