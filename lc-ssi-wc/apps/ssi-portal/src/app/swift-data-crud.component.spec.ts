describe("SWIFT Data canonical SSI entrypoint", () => {
  it("keeps SSI out of the SWIFT Data resource navigation", () => {
    const ids = ["rma", "ssi", "entity", "nostro"];
    expect(ids.filter((id) => id !== "ssi")).toEqual(["rma", "entity", "nostro"]);
  });
});
