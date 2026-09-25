const normalizePath = (value) => {
  const path = value.startsWith("/") ? value : `/${value}`;
  return path.startsWith("/api/") ? path.slice(4) : path;
};

const resolveRef = (oas, value) => {
  if (!value?.$ref) return value;
  if (!value.$ref.startsWith("#/")) return undefined;
  return value.$ref
    .slice(2)
    .split("/")
    .reduce(
      (current, token) =>
        current?.[token.replaceAll("~1", "/").replaceAll("~0", "~")],
      oas,
    );
};

const collectPropertyNames = (oas, schema, seen = new Set()) => {
  const resolved = resolveRef(oas, schema);
  if (!resolved || typeof resolved !== "object" || seen.has(resolved))
    return [];
  seen.add(resolved);
  const names = Object.keys(resolved.properties ?? {});
  for (const child of Object.values(resolved.properties ?? {})) {
    names.push(...collectPropertyNames(oas, child, seen));
  }
  for (const child of [
    resolved.items,
    ...(resolved.allOf ?? []),
    ...(resolved.anyOf ?? []),
    ...(resolved.oneOf ?? []),
  ]) {
    names.push(...collectPropertyNames(oas, child, seen));
  }
  return names;
};

const requestSchema = (operation) => {
  const content = operation?.requestBody?.content ?? {};
  return (
    content["application/json"]?.schema ?? Object.values(content)[0]?.schema
  );
};

const responseSchemas = (operation) =>
  Object.values(operation?.responses ?? {}).flatMap((response) => {
    const content = response?.content ?? {};
    const schema =
      content["application/json"]?.schema ?? Object.values(content)[0]?.schema;
    return schema ? [schema] : [];
  });

const schemaReferences = (schema, reference) => {
  if (!schema || typeof schema !== "object") return false;
  if (schema.$ref === reference) return true;
  return [
    ...(schema.allOf ?? []),
    ...(schema.anyOf ?? []),
    ...(schema.oneOf ?? []),
    schema.items,
  ].some((child) => schemaReferences(child, reference));
};

const collectRequiredNames = (oas, schema, seen = new Set()) => {
  const resolved = resolveRef(oas, schema);
  if (!resolved || typeof resolved !== "object" || seen.has(resolved))
    return [];
  seen.add(resolved);
  return [
    ...(resolved.required ?? []),
    ...(resolved.allOf ?? []).flatMap((child) =>
      collectRequiredNames(oas, child, seen),
    ),
  ];
};

const verifyResolutionPageExecutionContract = ({ oas, add }) => {
  const path = "/v1/resolution-page-definitions/execute";
  const operation = oas?.paths?.[path]?.post;
  if (!operation) {
    add(
      "RESOLUTION_PAGE_EXECUTE_OPERATION_MISSING",
      `POST ${path} is absent from the frozen OAS.`,
      { path },
    );
    return;
  }
  const schemas = responseSchemas(operation);
  const profileRef =
    "#/components/schemas/SsiOnlyResolutionPageExecutionResult";
  if (!schemas.some((schema) => schemaReferences(schema, profileRef)))
    add(
      "SSI_ONLY_EXECUTION_PROFILE_MISSING",
      `POST ${path} does not expose the strict SSI-only response profile.`,
      { path },
    );
  const required = new Set(collectRequiredNames(oas, { $ref: profileRef }));
  for (const field of [
    "paymentExecutable",
    "profileKind",
    "ssiApplicability",
    "resolutionOutcome",
  ])
    if (!required.has(field))
      add(
        "RESOLUTION_PAGE_EVIDENCE_FIELD_OPTIONAL",
        `POST ${path} response does not require ${field}.`,
        { path, field },
      );
};

const verifyRequestContract = ({ oas, operation, path, add }) => {
  const schema = requestSchema(operation);
  if (!schema) {
    add("REQUEST_SCHEMA_MISSING", `POST ${path} has no JSON request schema.`, {
      path,
    });
    return;
  }
  const properties = new Set(collectPropertyNames(oas, schema));
  const bankServiceIds = [...properties].filter((name) =>
    /bankServiceId$/i.test(name),
  );
  const rawBicInputs = [...properties].filter(
    (name) =>
      /(?:^|[A-Z_])bic$/i.test(name) && !/resolved|readOnly/i.test(name),
  );
  if (bankServiceIds.length === 0)
    add(
      "BANK_SERVICE_ID_INPUT_MISSING",
      `POST ${path} does not expose a stable *BankServiceId input.`,
      { path },
    );
  if (rawBicInputs.length > 0)
    add(
      "MANUAL_BIC_INPUT_EXPOSED",
      `POST ${path} exposes raw BIC input fields: ${rawBicInputs.join(", ")}.`,
      { path, fields: rawBicInputs },
    );
};

const verifyResponseContract = ({ oas, operation, path, add }) => {
  const responseProperties = new Set(
    responseSchemas(operation).flatMap((schema) =>
      collectPropertyNames(oas, schema),
    ),
  );
  if (!responseProperties.has("redirectDomain"))
    add(
      "REDIRECT_DOMAIN_RESPONSE_MISSING",
      `POST ${path} responses do not define the mandatory nullable redirectDomain field.`,
      { path },
    );
};

const verifyDomainContract = ({
  oas,
  domain,
  configuredPath,
  checkedPaths,
  add,
}) => {
  const path = normalizePath(configuredPath);
  const operation = oas?.paths?.[path]?.post;
  if (!operation) {
    add(
      "DOMAIN_POST_OPERATION_MISSING",
      `POST ${path} is absent from the frozen OAS.`,
      { domain, path },
    );
    return;
  }
  if (checkedPaths.has(path)) return;
  checkedPaths.add(path);
  verifyRequestContract({ oas, operation, path, add });
  verifyResponseContract({ oas, operation, path, add });
};

export const verifyMt2OasContract = ({ oas, endpoints }) => {
  const violations = [];
  const add = (code, detail, context = {}) =>
    violations.push({ code, detail, ...context });

  if (!(oas?.openapi ?? "").startsWith("3.")) {
    add(
      "OPENAPI_VERSION_UNSUPPORTED",
      "The frozen contract must be OpenAPI 3.x.",
    );
  }

  const domainEntries = Object.entries(endpoints?.domains ?? {});
  if (domainEntries.length === 0) {
    add(
      "DOMAIN_ENDPOINTS_MISSING",
      "No MT2 resolution domains are configured.",
    );
  }

  const checkedPaths = new Set();
  for (const [domain, configuredPath] of domainEntries) {
    verifyDomainContract({
      oas,
      domain,
      configuredPath,
      checkedPaths,
      add,
    });
  }
  verifyResolutionPageExecutionContract({ oas, add });

  return {
    status: violations.length === 0 ? "PASS" : "FAIL",
    checkedDomains: domainEntries.length,
    checkedPaths: [...checkedPaths],
    violations,
  };
};
