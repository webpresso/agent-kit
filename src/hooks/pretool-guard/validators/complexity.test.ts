import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ToolInput } from "#hooks/shared/types";

import { validateComplexity } from "./complexity.js";

const previousSkip = process.env.COMPLEXITY_WARNING_SKIP;

beforeEach(() => {
  delete process.env.COMPLEXITY_WARNING_SKIP;
});

afterEach(() => {
  if (previousSkip === undefined) delete process.env.COMPLEXITY_WARNING_SKIP;
  else process.env.COMPLEXITY_WARNING_SKIP = previousSkip;
});

function writeInput(filePath: string | undefined, content: string | undefined): ToolInput {
  return {
    tool_input: { ...(filePath ? { file_path: filePath } : {}), ...(content ? { content } : {}) },
  };
}

function lines(count: number): string {
  return Array.from({ length: count }, (_, index) => `line ${index + 1}`).join("\n");
}

describe("validateComplexity", () => {
  it("warns but passes when TypeScript content exceeds the line threshold", () => {
    const result = validateComplexity(writeInput("src/large.ts", lines(501)));

    expect(result).toMatchObject({ validator: "complexity", passed: true });
    expect(result.message).toContain("File has 501 lines");
  });

  it("passes JavaScript-family files under the threshold", () => {
    expect(validateComplexity(writeInput("src/small.tsx", lines(500)))).toEqual({
      validator: "complexity",
      passed: true,
    });
  });

  it("ignores non-code extensions", () => {
    expect(validateComplexity(writeInput("README.md", lines(1_000)))).toEqual({
      validator: "complexity",
      passed: true,
    });
  });

  it("passes null content and null file paths", () => {
    expect(validateComplexity(writeInput("src/file.ts", undefined))).toEqual({
      validator: "complexity",
      passed: true,
    });
    expect(validateComplexity(writeInput(undefined, lines(1_000)))).toEqual({
      validator: "complexity",
      passed: true,
    });
  });

  it("respects COMPLEXITY_WARNING_SKIP=1", () => {
    process.env.COMPLEXITY_WARNING_SKIP = "1";

    const result = validateComplexity(writeInput("src/large.ts", lines(1_000)));

    expect(result).toMatchObject({ validator: "complexity", passed: true, skipped: true });
  });
});
