import { describe, expect, it } from "vitest";

import { formatFailure, parseJsonSecrets } from "./secret-managers.js";

function processResult(output: {
  readonly stderr?: string;
  readonly stdout?: string;
}): Parameters<typeof formatFailure>[2] {
  return {
    stderr: output.stderr ?? "",
    stdout: output.stdout ?? "",
  } as Parameters<typeof formatFailure>[2];
}

function thrownMessage(callback: () => unknown): string {
  try {
    callback();
  } catch (error) {
    if (error instanceof Error) return error.message;
    return String(error);
  }
  throw new Error("Expected callback to throw.");
}

describe("formatFailure", () => {
  it("excludes stdout so secret-bearing command output is never leaked", () => {
    const message = thrownMessage(() =>
      formatFailure(
        "Doppler",
        "secret-manager fetch --provider doppler",
        processResult({
          stderr: "CLI failed",
          stdout: "STDOUT_SECRET=VALUE_DO_NOT_LEAK",
        }),
      ),
    );

    expect(message).toContain("CLI failed");
    expect(message).not.toContain("STDOUT_SECRET");
    expect(message).not.toContain("VALUE_DO_NOT_LEAK");
  });

  it("keeps only the first stderr line", () => {
    const message = thrownMessage(() =>
      formatFailure(
        "Infisical",
        "secret-manager fetch --provider infisical",
        processResult({
          stderr: "first stderr line\nsecond stderr line SECOND_LINE_SECRET_VALUE",
        }),
      ),
    );

    expect(message).toContain("first stderr line");
    expect(message).not.toContain("second stderr line");
    expect(message).not.toContain("SECOND_LINE_SECRET_VALUE");
  });

  it("redacts stderr before truncating the first line to 512 bytes", () => {
    const token = "a".repeat(80);
    const message = thrownMessage(() =>
      formatFailure(
        "Doppler",
        "secret-manager fetch --provider doppler",
        processResult({ stderr: `${".".repeat(500)}${token}` }),
      ),
    );
    const detail = message.split("\n").slice(1).join("\n");

    expect(detail.startsWith(".".repeat(500))).toBe(true);
    expect(Buffer.byteLength(detail, "utf8")).toBeLessThanOrEqual(512);
    expect(detail).not.toContain(token);
    expect(detail).not.toContain("a".repeat(40));
  });

  it("omits the detail line when stderr and stdout are empty", () => {
    const message = thrownMessage(() =>
      formatFailure(
        "Doppler",
        "secret-manager fetch --provider doppler",
        processResult({ stderr: "", stdout: "" }),
      ),
    );

    expect(message).toBe(
      "Unable to fetch secrets from Doppler using `secret-manager fetch --provider doppler`.",
    );
  });
});

describe("parseJsonSecrets", () => {
  it("rejects empty output", () => {
    expect(() => parseJsonSecrets("Doppler", "   ")).toThrow("returned an empty response");
  });

  it("rejects invalid JSON without echoing the offending input", () => {
    const message = thrownMessage(() => parseJsonSecrets("Doppler", "{broken"));

    expect(message).toContain("returned invalid JSON");
    expect(message).not.toContain("{broken");
  });

  it("rejects secret-like invalid JSON without echoing stdout snippets", () => {
    const message = thrownMessage(() => parseJsonSecrets("Doppler", "SECRET_VALUE_DO_NOT_LEAK"));

    expect(message).toContain("returned invalid JSON");
    expect(message).not.toContain("SECRET_VALUE_DO_NOT_LEAK");
    expect(message).not.toContain("DO_NOT_LEAK");
  });

  it.each(["[1,2,3]", '"string"', "42"])("rejects non-object JSON payload %s", (payload) => {
    expect(() => parseJsonSecrets("Infisical", payload)).toThrow("unexpected payload");
  });

  it("returns a valid flat string object", () => {
    expect(parseJsonSecrets("Doppler", '{"A":"one","B":"two"}')).toEqual({
      A: "one",
      B: "two",
    });
  });

  it("skips non-string object values", () => {
    expect(
      parseJsonSecrets("Infisical", '{"A":"one","B":2,"C":false,"D":null,"E":{"nested":true}}'),
    ).toEqual({ A: "one" });
  });
});
