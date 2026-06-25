import { describe, expect, it } from "vitest";

import {
  findResolvedTypecheckScopeGaps,
  findTypecheckHelpSurfaceGaps,
  formatResolvedTypecheckScopes,
  formatRuntimeTypecheckParityFailures,
} from "./runtime-parity.js";

describe("typecheck runtime parity helpers", () => {
  it("accepts typecheck help that exposes both targeting flags", () => {
    expect(findTypecheckHelpSurfaceGaps("Usage:\n  --file <path>\n  --package <name>\n")).toEqual(
      [],
    );
  });

  it("reports each missing typecheck targeting flag separately", () => {
    expect(findTypecheckHelpSurfaceGaps("Usage:\n  --file <path>\n")).toEqual([
      "typecheck --help is missing the --package flag",
    ]);
    expect(findTypecheckHelpSurfaceGaps("Usage:\n  --package <name>\n")).toEqual([
      "typecheck --help is missing the --file flag",
    ]);
  });

  it("accepts the expected resolved-scope preamble line", () => {
    const expectedScopes = ["@parity/root", "@parity/widget"];
    const output = `${formatResolvedTypecheckScopes(expectedScopes)}\n`;

    expect(findResolvedTypecheckScopeGaps(output, expectedScopes)).toEqual([]);
  });

  it("reports the missing resolved-scope line verbatim when parity drifts", () => {
    const expectedScopes = ["@parity/root", "@parity/widget"];

    expect(findResolvedTypecheckScopeGaps("typecheck passed\n", expectedScopes)).toEqual([
      'typecheck --file output is missing "Resolved typecheck scopes: @parity/root, @parity/widget"',
    ]);
  });

  it("formats multiple failures into a single bounded diagnostic string", () => {
    expect(
      formatRuntimeTypecheckParityFailures({
        failures: [
          "typecheck --help is missing the --file flag",
          "typecheck --file failed (exit 1)",
        ],
      }),
    ).toBe("typecheck --help is missing the --file flag; typecheck --file failed (exit 1)");
  });
});
