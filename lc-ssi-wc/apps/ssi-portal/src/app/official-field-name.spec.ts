import {
  OFFICIAL_FIELD_NAME_PENDING,
  presentOfficialFieldName,
} from "./official-field-name";

describe("presentOfficialFieldName", () => {
  it.each([
    ["Reimbursing Bank", "Reimbursing Bank"],
    ["'Advise Through' Bank", "'Advise Through' Bank"],
    ["Requested Confirmation Party", "Requested Confirmation Party"],
    ["", OFFICIAL_FIELD_NAME_PENDING],
    [null, OFFICIAL_FIELD_NAME_PENDING],
  ])("presents %p without deriving from canonicalRole", (input, expected) => {
    expect(presentOfficialFieldName(input)).toBe(expected);
  });
});
