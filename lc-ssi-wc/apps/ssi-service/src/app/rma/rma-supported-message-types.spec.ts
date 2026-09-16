import { loadRmaSupportedMessageTypes } from "./rma-supported-message-types";

describe("RMA supported Message Types", () => {
  it("is driven by the governed SSI scope for MT1/2/3/4/7 and MX", () => {
    expect(loadRmaSupportedMessageTypes()).toEqual(
      expect.arrayContaining([
        "MT103",
        "pacs.008.001.12",
        "MT202",
        "pacs.009.001.08",
        "MT202COV",
        "MT205",
        "MT205COV",
        "MT300",
        "MT400",
        "MT734",
      ]),
    );
    expect(loadRmaSupportedMessageTypes()).not.toContain("MT101");
    expect(loadRmaSupportedMessageTypes()).not.toContain("MT410");
  });
});
