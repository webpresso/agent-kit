import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ToolInput } from "#hooks/shared/types";

import { validateCommandFile } from "./command-file.js";

const previousSkip = process.env.COMMAND_FILE_SKIP;

beforeEach(() => {
  delete process.env.COMMAND_FILE_SKIP;
});

afterEach(() => {
  if (previousSkip === undefined) delete process.env.COMMAND_FILE_SKIP;
  else process.env.COMMAND_FILE_SKIP = previousSkip;
});

function writeInput(filePath: string, content: string): ToolInput {
  return { tool_input: { file_path: filePath, content } };
}

function lines(count: number): string {
  return Array.from({ length: count }, (_, index) => `line ${index + 1}`).join("\n");
}

describe("validateCommandFile", () => {
  it("blocks command files over 600 lines", () => {
    const result = validateCommandFile(writeInput("/repo/.claude/commands/big.md", lines(601)));

    expect(result.passed).toBe(false);
    expect(result.message).toContain("exceeds 600 lines");
  });

  it("blocks skill files over 400 lines", () => {
    const result = validateCommandFile(writeInput("/repo/.claude/skills/big/SKILL.md", lines(401)));

    expect(result.passed).toBe(false);
    expect(result.message).toContain("exceeds 400 lines");
  });

  it("passes command and skill files at their line limits", () => {
    expect(validateCommandFile(writeInput(".claude/commands/ok.md", lines(600)))).toEqual({
      validator: "command-file",
      passed: true,
    });
    expect(validateCommandFile(writeInput(".claude/skills/ok/SKILL.md", lines(400)))).toEqual({
      validator: "command-file",
      passed: true,
    });
  });

  it("passes unrelated files and missing content", () => {
    expect(validateCommandFile(writeInput("src/index.ts", lines(1_000))).passed).toBe(true);
    expect(
      validateCommandFile({ tool_input: { file_path: ".claude/commands/empty.md" } }).passed,
    ).toBe(true);
  });

  it("respects COMMAND_FILE_SKIP=1", () => {
    process.env.COMMAND_FILE_SKIP = "1";

    const result = validateCommandFile(writeInput(".claude/commands/big.md", lines(1_000)));

    expect(result).toMatchObject({ validator: "command-file", passed: true, skipped: true });
  });
});
