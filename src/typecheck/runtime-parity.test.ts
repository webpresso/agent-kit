import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  RUNTIME_TYPECHECK_PARITY_ROOT_FILE,
  findResolvedTypecheckScopeGaps,
  findTypecheckHelpSurfaceGaps,
  formatResolvedTypecheckScopes,
  formatRuntimeTypecheckParityFailures,
  probeRuntimeTypecheckParity,
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

describe("probeRuntimeTypecheckParity", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reuses a caller-provided seeded workspace without reseeding it", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "wp-runtime-parity-test-"));
    roots.push(workspaceRoot);
    const command = process.execPath;
    const args = [
      "--input-type=module",
      "--eval",
      [
        "const args = process.argv.slice(1);",
        "const emit = (value) => process.stdout.write(`${value}\\n`);",
        "if (args[0] !== 'typecheck') process.exit(2);",
        "if (args.includes('--help')) {",
        "  emit('Usage: wp typecheck');",
        "  emit('--file <path>');",
        "  emit('--package <name>');",
        "  process.exit(0);",
        "}",
        "emit('Resolved typecheck scopes: @parity/root, @parity/widget');",
      ].join(" "),
    ];

    const firstProbe = probeRuntimeTypecheckParity({ command, args, workspaceRoot });
    expect(firstProbe.ok).toBe(true);

    const rootFilePath = join(workspaceRoot, RUNTIME_TYPECHECK_PARITY_ROOT_FILE);
    writeFileSync(rootFilePath, "export const rootValue = 2\n", "utf8");

    const secondProbe = probeRuntimeTypecheckParity({ command, args, workspaceRoot });
    expect(secondProbe.ok).toBe(true);
    expect(readFileSync(rootFilePath, "utf8")).toBe("export const rootValue = 2\n");
  });
});
