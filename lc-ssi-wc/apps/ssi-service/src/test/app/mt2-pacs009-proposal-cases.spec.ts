import fs from "node:fs";
import path from "node:path";
import { CounterpartySsiResolutionService } from "../../app/counterparty-ssi-resolution.service";
import type { RouteResolutionRequest } from "../../app/route-resolution.policy";

type Json = Record<string, unknown>;
type ProposalCase = {
  caseId: string;
  fixtureBindingId: string;
  expected: Json;
};

const workspace = path.resolve(__dirname, "../../../../..");
const catalogue = JSON.parse(
  fs.readFileSync(
    path.join(workspace, "data/qa/mt2/mt2-pacs009-proposal-case-groups.json"),
    "utf8",
  ),
) as { cases: ProposalCase[] };
const fixtureRegistry = JSON.parse(
  fs.readFileSync(
    path.join(workspace, "data/qa/mt2/mt2-pacs009-proposal-fixtures.json"),
    "utf8",
  ),
) as {
  bindings: Record<
    string,
    { execution: { resolverRequest: RouteResolutionRequest; raw: Json } }
  >;
};

describe("MT2/pacs.009 Proposal §11 executable cases", () => {
  const resolver = new CounterpartySsiResolutionService();

  it.each(catalogue.cases)("$caseId", (proposalCase) => {
    const fixture = fixtureRegistry.bindings[proposalCase.fixtureBindingId];
    expect(fixture).toBeDefined();
    const result =
      resolver.precondition(fixture.execution.raw) ??
      resolver.resolve(
        fixture.execution.resolverRequest,
        fixture.execution.raw,
      );
    const mx = result["mx"] as Json;
    const actual = {
      httpStatus: mx["httpStatus"],
      ssiApplicability: result["ssiApplicability"] ?? mx["ssiApplicability"],
      resolutionOutcome: result["resolutionOutcome"] ?? mx["resolutionOutcome"],
      paymentExecutable: result["paymentExecutable"] ?? mx["paymentExecutable"],
      payloadGenerated: result["payloadGenerated"] ?? mx["payloadGenerated"],
      confirmedResolutionCreated:
        result["confirmedResolutionCreated"] ??
        mx["confirmedResolutionCreated"],
      repairQueueCreated:
        result["repairQueueCreated"] ?? mx["repairQueueCreated"],
    };
    expect(actual).toEqual(proposalCase.expected);
  });
});
