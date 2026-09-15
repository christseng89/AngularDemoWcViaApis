import fs from "node:fs";

import {
  validateExpectedOutput,
  validateResolutionIdentity,
} from "./expected-output-validator.mjs";

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const responseDifferences = ({ expected, response, actual }) => [
  ...(response.status === response.expectedStatus
    ? []
    : [
        `httpStatus expected ${response.expectedStatus}, received ${response.status}`,
      ]),
  ...validateExpectedOutput(expected.mx, actual.mx, "mx"),
  ...validateResolutionIdentity(expected.mx, actual.mx),
  ...validateExpectedOutput(expected.mt, actual.mt, "mt"),
];

export const executePreparedCases = async ({ cases, fetchImpl = fetch }) => {
  const results = [];
  for (const metadata of cases) {
    const request = readJson(metadata.requestFile);
    const expected = readJson(metadata.expectedFile);
    try {
      const response = await fetchImpl(metadata.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-qa-test-case": metadata.testCaseNo,
          "x-qa-message-type": metadata.messageType,
          "x-qa-domain": metadata.domain,
        },
        body: JSON.stringify(request),
      });
      const actualResponse = await response.json();
      const actual =
        actualResponse.mx || actualResponse.mt
          ? actualResponse
          : { mx: actualResponse, mt: actualResponse };
      const differences = responseDifferences({
        expected,
        response: {
          status: response.status,
          expectedStatus: metadata.expectedStatus,
        },
        actual,
      });
      results.push({
        ...metadata,
        status: differences.length === 0 ? "PASS" : "FAIL",
        differences,
        expected,
        actual,
        actualStatus: response.status,
      });
    } catch (error) {
      results.push({
        ...metadata,
        status: "FAIL",
        differences: [
          `request execution failed: ${error instanceof Error ? error.message : String(error)}`,
        ],
        expected,
        actual: null,
      });
    }
  }
  return results;
};
