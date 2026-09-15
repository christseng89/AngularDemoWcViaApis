const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const validateExpectedOutput = (expected, actual, path = "output") => {
  const errors = [];
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return [`${path} must be an array`];
    if (actual.length !== expected.length)
      errors.push(
        `${path} length expected ${expected.length}, received ${actual.length}`,
      );
    expected.forEach((value, index) =>
      errors.push(
        ...validateExpectedOutput(value, actual[index], `${path}[${index}]`),
      ),
    );
    return errors;
  }
  if (isObject(expected)) {
    if (!isObject(actual)) return [`${path} must be an object`];
    for (const [key, value] of Object.entries(expected))
      errors.push(
        ...validateExpectedOutput(value, actual[key], `${path}.${key}`),
      );
    return errors;
  }
  if (actual !== expected)
    errors.push(
      `${path} expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
  return errors;
};

export const validateResolutionIdentity = (
  expectedMx,
  actualMx,
  path = "mx.chosenRoute",
) => {
  if (!isObject(expectedMx) || !isObject(actualMx)) return [];
  const expectedRoute = isObject(expectedMx.chosenRoute)
    ? expectedMx.chosenRoute
    : {};
  const expectedIdentity = {
    ssiCode: expectedRoute.ssiCode ?? expectedMx.canonicalRoles?.selectedSsi,
    ssiVersion: expectedRoute.ssiVersion,
    nostroId: expectedRoute.nostroId,
    nostroVersion: expectedRoute.nostroVersion,
  };
  const assertedFields = Object.entries(expectedIdentity).filter(
    ([, value]) => value !== undefined && value !== null,
  );
  if (assertedFields.length === 0) return [];
  if (!isObject(actualMx.chosenRoute)) return [`${path} must be an object`];
  return assertedFields.flatMap(([field, expected]) =>
    actualMx.chosenRoute[field] === expected
      ? []
      : [
          `${path}.${field} expected ${JSON.stringify(expected)}, received ${JSON.stringify(actualMx.chosenRoute[field])}`,
        ],
  );
};
