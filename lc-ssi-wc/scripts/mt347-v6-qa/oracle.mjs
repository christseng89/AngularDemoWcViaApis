const objectLike = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const compareOracle = (expected, actual, path = "result") => {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return [`${path} must be an array`];
    const errors =
      expected.length === actual.length
        ? []
        : [
            `${path} length expected ${expected.length}, received ${actual.length}`,
          ];
    expected.forEach((value, index) =>
      errors.push(...compareOracle(value, actual[index], `${path}[${index}]`)),
    );
    return errors;
  }
  if (objectLike(expected)) {
    if (!objectLike(actual)) return [`${path} must be an object`];
    return Object.entries(expected).flatMap(([key, value]) =>
      compareOracle(value, actual[key], `${path}.${key}`),
    );
  }
  return Object.is(expected, actual)
    ? []
    : [
        `${path} expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
      ];
};

export const validateExecutionEvidence = (evidence, expectedOwner) => {
  const errors = [];
  const required = [
    "caseId",
    "correlationId",
    "requestSha256",
    "responseSha256",
    "fixtureBinding",
    "snapshotIdentity",
  ];
  for (const field of required)
    if (!evidence?.[field]) errors.push(`${field} is required`);
  if (evidence?.validationOwner !== expectedOwner)
    errors.push(`validationOwner must be ${expectedOwner}`);
  if (expectedOwner === "UPSTREAM_FIN_VALIDATOR") {
    for (const field of ["validatorIdentity", "validatorVersion", "ruleKey"])
      if (!evidence?.[field])
        errors.push(`${field} is required for upstream evidence`);
    if (evidence?.ssiOutcome !== "NOT_EVALUATED")
      errors.push(
        "ssiOutcome must be NOT_EVALUATED for upstream-owned validation",
      );
  }
  return errors;
};
