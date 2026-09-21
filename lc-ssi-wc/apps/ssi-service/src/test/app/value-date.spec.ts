import { BadRequestException } from "@nestjs/common";
import { assertIsoValueDate } from "../../app/value-date";

describe("assertIsoValueDate", () => {
  it.each(["2026-01-01", "2028-02-29"])("accepts %s", (value) => {
    expect(() => assertIsoValueDate(value)).not.toThrow();
  });

  it.each(["", "2026-02-29", "2026-13-01", "09/07/2026", "not-a-date"])(
    "fails closed for %s",
    (value) => {
      expect(() => assertIsoValueDate(value)).toThrow(BadRequestException);
    },
  );
});
