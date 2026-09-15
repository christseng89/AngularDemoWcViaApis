import { spawn } from "node:child_process";
import { QualityGate, failed, passed } from "./quality-gate.mjs";

const parseNodeCommand = (command) => {
  if (
    !Array.isArray(command) ||
    command.length === 0 ||
    command.some((argument) => typeof argument !== "string")
  )
    throw new Error("command must be a non-empty string array");
  const [executable, ...argumentsList] = command;
  if (executable !== "node")
    throw new Error("only the controlled Node.js executable is allowed");
  return { executable: process.execPath, argumentsList };
};

export class ProcessGate extends QualityGate {
  constructor(definition, context) {
    super(definition.id, definition.required !== false);
    this.definition = definition;
    this.context = context;
  }

  async execute() {
    const started = Date.now();
    const command = this.definition.command;
    let parsed;
    try {
      parsed = parseNodeCommand(command);
    } catch (error) {
      return failed(
        this.id,
        error instanceof Error ? error.message : String(error),
        { command },
      );
    }
    return new Promise((resolve) => {
      const child = spawn(parsed.executable, parsed.argumentsList, {
        cwd: this.context.workspace,
        env: { ...process.env, ...this.definition.environment },
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (value) => (stdout += value));
      child.stderr.on("data", (value) => (stderr += value));
      child.on("error", (error) => resolve(failed(this.id, error.message)));
      child.on("close", (code) => {
        const evidence = {
          command,
          code,
          durationMs: Date.now() - started,
          stdout,
          stderr,
        };
        resolve(
          code === 0
            ? passed(this.id, evidence)
            : failed(this.id, `exit code ${code}`, evidence),
        );
      });
    });
  }
}
