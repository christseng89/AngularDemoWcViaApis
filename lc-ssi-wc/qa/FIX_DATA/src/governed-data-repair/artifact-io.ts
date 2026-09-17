import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";

export interface ArtifactIdentity {
  readonly path: string;
  readonly sha256: string;
}

export class Sha256FileIdentity {
  ofBytes(bytes: Uint8Array): string {
    return createHash("sha256")
      .update(bytes)
      .digest("hex")
      .toUpperCase();
  }

  ofText(value: string): string {
    return this.ofBytes(Buffer.from(value, "utf8"));
  }

  ofFile(path: string): string {
    return this.ofBytes(readFileSync(path));
  }

  assertFile(path: string, expectedSha256: string, code: string): void {
    const expected = expectedSha256.toUpperCase();
    const actual = this.ofFile(path);
    if (actual !== expected) {
      throw new Error(`${code}:expected=${expected}:actual=${actual}`);
    }
  }
}

export class DeterministicJsonFileWriter {
  private readonly identity: Sha256FileIdentity;

  constructor(identity: Sha256FileIdentity) {
    this.identity = identity;
  }

  serialize(value: unknown): string {
    return `${JSON.stringify(value, null, 2)}\n`;
  }

  write(path: string, value: unknown): ArtifactIdentity {
    const content = this.serialize(value);
    const sha256 = this.identity.ofText(content);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, "utf8");
    writeFileSync(
      `${path}.sha256`,
      `${sha256}  ${basename(path)}\n`,
      "utf8",
    );
    return Object.freeze({ path, sha256 });
  }
}
