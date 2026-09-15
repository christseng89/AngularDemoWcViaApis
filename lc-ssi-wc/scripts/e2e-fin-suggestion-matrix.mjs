const api = process.env.BFF_URL ?? "http://localhost:3100/api";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const call = async (body) => {
  const response = await fetch(`${api}/reference/fin-tag-suggestions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  return {
    status: response.status,
    data,
    code: data.code ?? data.message ?? "",
  };
};

const master = (ownerSide, sourceType, id) => ({
  ownerSide,
  sourceType,
  sourceRecordId: id,
  status: "ACTIVE",
  approvalStatus: "APPROVED",
  effectiveFrom: "2026-01-01",
  version: "1",
});
const transaction = (sourceType, roleAssignment, id) => ({
  ownerSide: "TRANSACTION_PARTY",
  sourceType,
  authorizedChannel: true,
  transactionId: id,
  messageVersion: "1",
  roleAssignment,
});
const base = (messageType, businessFunction, index) => ({
  service: "FIN",
  standardsRelease: "SR2026",
  messageType,
  direction: "OUTGOING",
  businessFunction,
  transactionReference: `MATRIX-${messageType}-${String(index).padStart(3, "0")}`,
  currency: ["GBP", "USD", "EUR", "HKD", "JPY"][index % 5],
  receiverBic: ["CITIUS33", "CHASUS33", "DEUTDEFF", "BARCGB22"][index % 4],
  valueDate: `2026-09-${String((index % 20) + 1).padStart(2, "0")}`,
  roles: {},
  roleEvidence: {},
});

const verifiedProfiles = [
  { messageType: "MT700", businessFunction: "MT700_ISSUANCE" },
  {
    messageType: "MT760",
    businessFunction: "GUARANTEE_STANDBY_ISSUANCE",
    controls: {
      sequence: "B",
      purpose: "ISSU",
      formOfUndertaking: "STBY",
      confirmationInstructions: "WITHOUT",
      field50Present: true,
    },
  },
  { messageType: "MT765", businessFunction: "GUARANTEE_CLAIM" },
];

const pendingProfiles = [
  "MT400",
  "MT705",
  "MT707",
  "MT710",
  "MT720",
  "MT730",
  "MT734",
  "MT740",
  "MT742",
  "MT750",
  "MT752",
  "MT754",
  "MT756",
  "MT768",
  "MT769",
];

let executed = 0;
for (const profile of verifiedProfiles) {
  for (let index = 1; index <= 20; index += 1) {
    const input = {
      ...base(profile.messageType, profile.businessFunction, index),
      controls: profile.controls,
    };
    const result = await call(input);
    assert(
      result.status === 201 && result.data.paymentExecutable === false,
      `${profile.messageType}-${index} expected safe reference output: ${JSON.stringify(result)}`,
    );
    assert(
      Object.keys(result.data.fields).length === 0,
      `${profile.messageType}-${index} must not invent an optional tag`,
    );
    executed += 1;
  }
}

for (const messageType of pendingProfiles) {
  for (let index = 1; index <= 25; index += 1) {
    const businessFunction =
      messageType === "MT400"
        ? "COLLECTION_PAYMENT_DIRECT"
        : messageType === "MT742"
          ? "REIMBURSEMENT_CLAIM"
          : "PENDING_OUTWARD_PROFILE";
    const input = base(messageType, businessFunction, index);
    if (index === 21) input.direction = "INCOMING";
    if (index === 22) input.currency = "GB";
    if (index === 23) input.receiverBic = "BAD";
    if (index === 24) delete input.currency;
    if (index === 25) input.roles = { UNVERIFIED_ROLE: "BARCGB22" };
    const result = await call(input);
    const expected =
      index === 21
        ? "DIRECTION_NOT_SUPPORTED"
        : index === 22
          ? "INPUT_INVALID_CURRENCY"
          : index === 23
            ? "INVALID_RECEIVER_FI_BIC_FORMAT"
            : index === 24
              ? "REFERENCE_FIN_CONTEXT_REQUIRED"
              : "MAPPING_PENDING";
    assert(
      result.status === 400 && result.code === expected,
      `${messageType}-P${index} expected ${expected}: ${JSON.stringify(result)}`,
    );
    if (expected === "MAPPING_PENDING") {
      assert(
        Object.keys(result.data.fields ?? {}).length === 0 &&
          result.data.paymentExecutable === false &&
          result.data.candidateFields?.length > 0,
        `${messageType}-P${index} pending response must expose metadata only`,
      );
    }
    executed += 1;
  }
}

const mt760Base = {
  ...base("MT760", "GUARANTEE_STANDBY_ISSUANCE", 91),
  controls: {
    sequence: "B",
    purpose: "ISSU",
    formOfUndertaking: "STBY",
    confirmationInstructions: "WITHOUT",
    field50Present: true,
  },
};
const mt760Cases = [
  {
    name: "57 requires 56",
    input: {
      ...mt760Base,
      roles: { ADVISE_THROUGH_BANK: "DEUTDEFF" },
      roleEvidence: {
        ADVISE_THROUGH_BANK: transaction(
          "TRANSACTION_ADVISING_CHAIN",
          "ADVISE_THROUGH_BANK",
          "TX-760-57",
        ),
      },
    },
    code: "MT760_C81_57A_REQUIRES_56A",
  },
  {
    name: "CONFIRM requires 58",
    input: {
      ...mt760Base,
      controls: { ...mt760Base.controls, confirmationInstructions: "CONFIRM" },
    },
    code: "MT760_C20_CONFIRMATION_REQUIRES_58A",
  },
  {
    name: "WITHOUT prohibits 58",
    input: {
      ...mt760Base,
      roles: { REQUESTED_CONFIRMATION_PARTY: "CITIUS33" },
      roleEvidence: {
        REQUESTED_CONFIRMATION_PARTY: master(
          "TRANSACTION_PARTY",
          "CONFIRMATION_MANDATE",
          "MANDATE-760-58",
        ),
      },
    },
    code: "MT760_C20_WITHOUT_PROHIBITS_58A",
  },
  {
    name: "STBY ISSU requires field 50",
    input: {
      ...mt760Base,
      controls: { ...mt760Base.controls, field50Present: false },
    },
    code: "MT760_C17_FIELD_50_REQUIRED",
  },
  {
    name: "DGAR prohibits 49",
    input: {
      ...mt760Base,
      controls: { ...mt760Base.controls, formOfUndertaking: "DGAR" },
    },
    code: "MT760_C5_DGAR_PROHIBITS_49",
  },
];

for (const testCase of mt760Cases) {
  const result = await call(testCase.input);
  assert(
    result.status === 400 && result.code === testCase.code,
    `${testCase.name} expected ${testCase.code}: ${JSON.stringify(result)}`,
  );
  executed += 1;
}

assert(executed >= 425, `Expected at least 425 matrix cases, got ${executed}`);
console.log("Outward FIN Suggestion matrix passed", {
  executed,
  verifiedMessages: verifiedProfiles.length,
  pendingMessages: pendingProfiles.length,
});
