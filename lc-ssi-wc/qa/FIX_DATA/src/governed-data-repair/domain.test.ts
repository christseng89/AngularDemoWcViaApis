import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CanonicalBic,
  EntityCanonicalKey,
  NostroCanonicalKey,
  RmaCanonicalKey,
  SegmentationPolicy,
  SsiCanonicalKey,
} from "./domain.ts";

describe("CanonicalBic", () => {
  it("canonicalizes BIC8 to BIC11", () => {
    assert.equal(CanonicalBic.from(" citius33 ").value, "CITIUS33XXX");
  });

  it("preserves canonical BIC11", () => {
    assert.equal(CanonicalBic.from("DEMOHKHHXXX").value, "DEMOHKHHXXX");
  });

  it("rejects an invalid BIC", () => {
    assert.throws(() => CanonicalBic.from("CP-BOFAUS3N"), /INVALID_BIC/);
  });
});

describe("canonical domain identities", () => {
  it("builds an Entity key", () => {
    assert.equal(EntityCanonicalKey.from("hk01", "hk01").value, "HK01|HK01");
  });

  it("builds a Nostro key", () => {
    assert.equal(
      NostroCanonicalKey.from({
        ownLegalEntityId: "hk01",
        accountServicerBic: "citius33",
        currency: "usd",
        purpose: "settlement",
        maskedAccountRef: " acct-1 ",
      }).value,
      "HK01|CITIUS33XXX|USD|SETTLEMENT|ACCT-1",
    );
  });

  it("builds an SSI key", () => {
    assert.equal(
      SsiCanonicalKey.from({
        ownershipType: "COUNTERPARTY",
        ownerParty: "bofaus3n",
        publisherParty: "bofaus3n",
        counterpartyType: "BANK",
        counterpartyBic: "bofaus3n",
        scope: "standing",
        currency: "aud",
        businessFunction: "settlement",
      }).value,
      "COUNTERPARTY|BOFAUS3N|BOFAUS3N|BANK|BOFAUS3NXXX|STANDING|AUD|SETTLEMENT",
    );
  });

  it("builds the RMA bank-direction key without status or service", () => {
    assert.equal(
      RmaCanonicalKey.from("demohkhh", "citius33", "outbound").value,
      "DEMOHKHHXXX|CITIUS33XXX|OUTBOUND",
    );
  });
});

describe("SegmentationPolicy", () => {
  it("always assigns the same key to the same segment", () => {
    const policy = new SegmentationPolicy(4);
    const key = RmaCanonicalKey.from("demohkhh", "citius33", "INBOUND");

    assert.equal(policy.segmentOf(key), policy.segmentOf(key));
    assert.ok(policy.segmentOf(key) >= 0 && policy.segmentOf(key) < 4);
  });
});
