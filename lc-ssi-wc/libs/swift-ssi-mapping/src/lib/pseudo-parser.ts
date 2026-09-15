import type { MessageDirection, PseudoMessage } from "@ssi/contracts";
import { scalarText } from "./scalar-text";
export class PseudoMessageParseError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PseudoMessageParseError";
  }
}
export class PseudoMessageParser {
  parse(content: string, format: "FIN_LIKE" | "MX_JSON"): PseudoMessage {
    return format === "FIN_LIKE"
      ? this.parseFinLike(content)
      : this.parseJson(content);
  }
  private parseFinLike(content: string): PseudoMessage {
    const headers: Record<string, string> = {};
    const fields: Record<string, string> = {};
    for (const raw of content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)) {
      const field = /^:([^:]+):(.+)$/.exec(raw);
      if (field?.[1] && field[2]) {
        fields[field[1]] = field[2];
        continue;
      }
      const header = /^([A-Z_]+)=(.+)$/.exec(raw);
      if (header?.[1] && header[2]) {
        headers[header[1]] = header[2];
        continue;
      }
      throw new PseudoMessageParseError(
        "INVALID_PSEUDO_LINE",
        `Unsupported pseudo message line: ${raw}`,
      );
    }
    return this.toMessage(headers, fields);
  }
  private parseJson(content: string): PseudoMessage {
    let value: unknown;
    try {
      value = JSON.parse(content);
    } catch {
      throw new PseudoMessageParseError(
        "INVALID_JSON",
        "Invalid pseudo MX JSON",
      );
    }
    if (typeof value !== "object" || value === null || Array.isArray(value))
      throw new PseudoMessageParseError(
        "INVALID_JSON_SHAPE",
        "Object expected",
      );
    const input = value as Record<string, unknown>;
    return this.toMessage(
      {
        STANDARDS_RELEASE: scalarText(input["standardsRelease"]),
        MESSAGE_TYPE: scalarText(input["messageType"]),
        DIRECTION: scalarText(input["direction"]),
        BUSINESS_FUNCTION: scalarText(input["businessFunction"]),
      },
      typeof input["fields"] === "object" &&
        input["fields"] !== null &&
        !Array.isArray(input["fields"])
        ? (input["fields"] as Record<string, string>)
        : {},
    );
  }
  private toMessage(
    headers: Record<string, string>,
    fields: Record<string, string>,
  ): PseudoMessage {
    for (const key of [
      "STANDARDS_RELEASE",
      "MESSAGE_TYPE",
      "DIRECTION",
      "BUSINESS_FUNCTION",
    ] as const)
      if (!headers[key])
        throw new PseudoMessageParseError(
          "MISSING_HEADER",
          `${key} is required`,
        );
    if (
      headers["DIRECTION"] !== "INCOMING" &&
      headers["DIRECTION"] !== "OUTGOING"
    )
      throw new PseudoMessageParseError(
        "INVALID_DIRECTION",
        "Direction must be INCOMING or OUTGOING",
      );
    return Object.freeze({
      standardsRelease: headers["STANDARDS_RELEASE"]!,
      messageType: headers["MESSAGE_TYPE"]!,
      direction: headers["DIRECTION"] as MessageDirection,
      businessFunction: headers["BUSINESS_FUNCTION"]!,
      fields: Object.freeze({ ...fields }),
    });
  }
}
