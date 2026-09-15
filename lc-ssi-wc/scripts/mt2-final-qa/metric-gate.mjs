import fs from "node:fs";
import { QualityGate, failed, passed } from "./quality-gate.mjs";

export class MetricGate extends QualityGate {
  constructor(id, file, property, threshold, comparison) {
    super(id);
    Object.assign(this, { file, property, threshold, comparison });
  }

  async execute() {
    if (!fs.existsSync(this.file))
      return failed(this.id, `metric evidence missing: ${this.file}`);
    const value = this.property
      .split(".")
      .reduce(
        (current, key) => current?.[key],
        JSON.parse(fs.readFileSync(this.file, "utf8")),
      );
    const ok =
      typeof value === "number" &&
      (this.comparison === "gt"
        ? value > this.threshold
        : value < this.threshold);
    return ok
      ? passed(this.id, {
          value,
          threshold: this.threshold,
          comparison: this.comparison,
        })
      : failed(
          this.id,
          `metric ${value} does not satisfy ${this.comparison} ${this.threshold}`,
          { value },
        );
  }
}
