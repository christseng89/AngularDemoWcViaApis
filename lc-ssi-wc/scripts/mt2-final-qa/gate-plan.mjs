export const acceptanceGateIds = (configuredGateIds) => {
  const finalGateId = "RUNTIME_SNAPSHOT_POST";
  const finalCount = configuredGateIds.filter(
    (id) => id === finalGateId,
  ).length;
  if (finalCount !== 1)
    throw new Error(`${finalGateId} must be configured exactly once.`);
  return [
    ...configuredGateIds.filter((id) => id !== finalGateId),
    "COVERAGE_GT_95",
    "DUPLICATION_LT_1",
    finalGateId,
  ];
};
