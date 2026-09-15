import assert from "node:assert/strict";
import test from "node:test";
import { verifyMt2OasContract } from "./oas-contract-verifier.mjs";

const endpoints = { domains: { COUNTERPARTY_SSI: "/api/settlements/resolve" } };

const compliantOas = {
  openapi: "3.1.0",
  paths: {
    "/settlements/resolve": {
      post: {
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ResolveRequest" },
            },
          },
        },
        responses: {
          200: {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ResolveResponse" },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      ResolveRequest: {
        type: "object",
        properties: { beneficiaryBankServiceId: { type: "string" } },
      },
      ResolveResponse: {
        type: "object",
        required: ["redirectDomain"],
        properties: {
          redirectDomain: {
            type: ["string", "null"],
            enum: ["OWN_SSI_NOSTRO", "FI_DIRECT_DEBIT", "NOTIFICATION", null],
          },
        },
      },
    },
  },
};

test("MT2 OAS verifier accepts Bank Service ID input and redirectDomain output", () => {
  assert.deepEqual(
    verifyMt2OasContract({ oas: compliantOas, endpoints }).violations,
    [],
  );
});

test("MT2 OAS verifier rejects missing domain operations", () => {
  const result = verifyMt2OasContract({
    oas: { ...compliantOas, paths: {} },
    endpoints,
  });
  assert.equal(result.status, "FAIL");
  assert.equal(result.violations[0].code, "DOMAIN_POST_OPERATION_MISSING");
});

test("MT2 OAS verifier fails closed when request schema is absent", () => {
  const oas = globalThis.structuredClone(compliantOas);
  delete oas.paths["/settlements/resolve"].post.requestBody;
  const result = verifyMt2OasContract({ oas, endpoints });
  assert.ok(
    result.violations.some(({ code }) => code === "REQUEST_SCHEMA_MISSING"),
  );
});

test("MT2 OAS verifier rejects manual BIC input and absent redirectDomain", () => {
  const oas = globalThis.structuredClone(compliantOas);
  oas.components.schemas.ResolveRequest.properties = {
    beneficiaryBic: { type: "string" },
  };
  oas.components.schemas.ResolveResponse.properties = {};
  const codes = verifyMt2OasContract({ oas, endpoints }).violations.map(
    ({ code }) => code,
  );
  assert.ok(codes.includes("BANK_SERVICE_ID_INPUT_MISSING"));
  assert.ok(codes.includes("MANUAL_BIC_INPUT_EXPOSED"));
  assert.ok(codes.includes("REDIRECT_DOMAIN_RESPONSE_MISSING"));
});

test("MT2 OAS verifier rejects an unsupported version and empty domain registry", () => {
  const result = verifyMt2OasContract({
    oas: { ...compliantOas, openapi: "2.0" },
    endpoints: { domains: {} },
  });
  assert.equal(result.status, "FAIL");
  assert.deepEqual(
    result.violations.map(({ code }) => code),
    ["OPENAPI_VERSION_UNSUPPORTED", "DOMAIN_ENDPOINTS_MISSING"],
  );
});
