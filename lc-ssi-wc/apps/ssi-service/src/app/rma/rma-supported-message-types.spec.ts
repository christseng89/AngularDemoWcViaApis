import {
  RmaSupportedMessageTypeCatalogue,
  loadRmaSupportedMessageTypes,
} from "./rma-supported-message-types";

describe("RMA supported Message Types", () => {
  it("is driven by the governed SSI scope for MT1/2/3/4/7 and MX", () => {
    expect(loadRmaSupportedMessageTypes()).toEqual(
      expect.arrayContaining([
        "MT103",
        "pacs.008.001.08",
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
    expect(loadRmaSupportedMessageTypes()).not.toContain("MT700");
    expect(loadRmaSupportedMessageTypes()).not.toContain("pacs.008.001.12");
  });

  it("loads the legacy .12 to .08 repair conversion from parameters", () => {
    expect(
      RmaSupportedMessageTypeCatalogue.fromWorkspace().loadPolicy()
        .legacyConversions,
    ).toEqual([
      expect.objectContaining({
        from: "pacs.008.001.12",
        to: "pacs.008.001.08",
      }),
    ]);
  });
});
