const normalized = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

export function stableNostroSeedKey(record) {
  return [
    record.ownLegalEntityId,
    record.accountServicerBic,
    record.currency,
    record.purpose,
    record.maskedAccountRef,
  ]
    .map(normalized)
    .join("|");
}

export function isOperationalDemoNostro(record) {
  return (
    (record.dataUse === undefined || record.dataUse === "OPERATIONAL_DEMO") &&
    !normalized(record.ownLegalEntityId).startsWith("BASELINE-") &&
    !record.fixtureFamily &&
    !(record.fixtureBindingIds?.length > 0) &&
    !record.usageGroup
  );
}

export function findCurrentSeedNostro(records, desired, maker) {
  const key = stableNostroSeedKey(desired);
  return records.find(
    (record) =>
      stableNostroSeedKey(record) === key &&
      (record.status === "ACTIVE" ||
        (["DRAFT", "WIP"].includes(record.status) && record.maker === maker)),
  );
}

export function duplicateActiveNostros(records) {
  const grouped = new Map();
  for (const record of records) {
    if (record.status !== "ACTIVE" || !isOperationalDemoNostro(record))
      continue;
    const key = stableNostroSeedKey(record);
    const group = grouped.get(key) ?? [];
    group.push(record);
    grouped.set(key, group);
  }
  const duplicates = [];
  for (const group of grouped.values()) {
    if (group.length < 2) continue;
    group.sort(
      (left, right) =>
        Number(right.version ?? 0) - Number(left.version ?? 0) ||
        String(right.updatedAt ?? "").localeCompare(
          String(left.updatedAt ?? ""),
        ) ||
        String(right.id).localeCompare(String(left.id)),
    );
    duplicates.push(...group.slice(1));
  }
  return duplicates;
}
