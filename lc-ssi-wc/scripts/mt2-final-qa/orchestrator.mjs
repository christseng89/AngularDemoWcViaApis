export class QaOrchestrator {
  constructor(gates, { failFast = true } = {}) {
    this.gates = gates;
    this.failFast = failFast;
  }

  async run() {
    const results = [];
    for (const gate of this.gates) {
      const result = await gate.execute();
      results.push(result);
      if (this.failFast && gate.required && result.status !== "PASS") break;
    }
    const accepted =
      results.length === this.gates.length &&
      results.every((result) => result.status === "PASS");
    return { status: accepted ? "ACCEPTED" : "BLOCKED", results };
  }
}
