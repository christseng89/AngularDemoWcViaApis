export class QualityGate {
  constructor(id, required = true) {
    if (new.target === QualityGate)
      throw new TypeError("QualityGate is abstract");
    this.id = id;
    this.required = required;
  }

  async execute() {
    throw new Error("execute() must be implemented");
  }
}

export const passed = (gate, evidence = {}) => ({
  gate,
  status: "PASS",
  evidence,
});
export const failed = (gate, reason, evidence = {}) => ({
  gate,
  status: "FAIL",
  reason,
  evidence,
});
