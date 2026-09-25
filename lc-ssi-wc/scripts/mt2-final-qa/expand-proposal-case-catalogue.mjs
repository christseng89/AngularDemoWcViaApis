import fs from "node:fs";

const file = "data/qa/mt2/mt2-pacs009-proposal-case-groups.json";
const catalogue = JSON.parse(fs.readFileSync(file, "utf8"));
const profiles = catalogue.profiles;

const letters = (expression) => {
  if (expression === "SINGLE") return [""];
  if (/^[A-Z]$/.test(expression)) return [expression];
  const [, first, last] = /^([A-Z])\.\.([A-Z])$/.exec(expression);
  return Array.from(
    { length: last.charCodeAt(0) - first.charCodeAt(0) + 1 },
    (_, index) => String.fromCharCode(first.charCodeAt(0) + index),
  );
};

const testFileFor = (id) => {
  if (/202COV|205COV|205-|OWNACCT|CUSTOMER|PRESENCE/.test(id))
    return "payment-resolution-page-submission.adapter.spec.ts";
  if (/ROUTE-011/.test(id)) return "settlement.controller.spec.ts";
  if (
    /PROFILE|RMA|STTLM|ACCOUNT|PICKER|MAP|NOTREQ|CONFIG|PRECEDENCE|OPTIONS|SNAPSHOT|JURIS|NONCOVER|C81|DIR/.test(
      id,
    )
  )
    return "counterparty-ssi-resolution.service.spec.ts";
  return "resolution-page-definition.controller.spec.ts";
};

catalogue.cases = catalogue.groups.flatMap((group) =>
  letters(group.variants).flatMap((variant) => {
    const variants = group.profileMatrix ? profiles : [undefined];
    return variants.map((profileId) => {
      const profileSuffix = profileId ? `-${profileId.split("-")[1]}` : "";
      const caseId = `${group.id}${variant}${profileSuffix}`;
      return {
        caseId,
        scenarioGroupId: group.id,
        fixtureBindingId: `${group.id}${variant || "-SINGLE"}`,
        request: {
          direction: catalogue.direction,
          localRole: catalogue.localRole,
          ...(profileId ? { profileId } : {}),
        },
        expected: {
          allowedResolutionOutcomes: group.outcomes,
          ...catalogue.sideEffects,
        },
        executableTest: testFileFor(group.id),
      };
    });
  }),
);

fs.writeFileSync(file, `${JSON.stringify(catalogue, null, 2)}\n`);
