import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ToolInput } from "#hooks/shared/types";

import { validateUxQuality } from "./ux-quality.js";

const previousSkip = process.env.UX_QUALITY_SKIP;

beforeEach(() => {
  delete process.env.UX_QUALITY_SKIP;
});

afterEach(() => {
  if (previousSkip === undefined) delete process.env.UX_QUALITY_SKIP;
  else process.env.UX_QUALITY_SKIP = previousSkip;
});

function writeInput(content: string, filePath = "src/App.tsx"): ToolInput {
  return { tool_input: { file_path: filePath, content } };
}

describe("validateUxQuality", () => {
  it("blocks alert and window.alert calls", () => {
    const result = validateUxQuality(writeInput("alert('bad');\nwindow.alert('also bad');"));

    expect(result.passed).toBe(false);
    expect(result.message).toContain("Avoid alert()");
    expect(result.message).toContain("Avoid window.alert()");
  });

  it("blocks catch blocks that only log console.error", () => {
    const result = validateUxQuality(
      writeInput("try { await save() } catch (err) { console.error(err); }"),
    );

    expect(result.passed).toBe(false);
    expect(result.message).toContain("catch block only logs with console.error");
  });

  it("blocks useQuery destructuring without pending and error states", () => {
    const result = validateUxQuality(
      writeInput("const { data, isPending } = useQuery({ queryKey, queryFn });"),
    );

    expect(result.passed).toBe(false);
    expect(result.message).toContain("must include isError");
  });

  it("blocks assigning the whole useQuery result without state handling", () => {
    const result = validateUxQuality(writeInput("const query = useQuery({ queryKey, queryFn });"));

    expect(result.passed).toBe(false);
    expect(result.message).toContain("must handle isPending and isError states");
  });

  it("passes clean content and non-code extensions", () => {
    expect(
      validateUxQuality(
        writeInput(
          "const { data, isPending, isError } = useQuery({ queryKey, queryFn });\nshowToast('saved');",
        ),
      ),
    ).toEqual({ validator: "ux-quality", passed: true });
    expect(validateUxQuality(writeInput("alert('docs example')", "README.md"))).toEqual({
      validator: "ux-quality",
      passed: true,
    });
  });

  it("respects UX_QUALITY_SKIP=1", () => {
    process.env.UX_QUALITY_SKIP = "1";

    const result = validateUxQuality(writeInput("alert('bypass');"));

    expect(result).toMatchObject({ validator: "ux-quality", passed: true, skipped: true });
    expect(result.skipReason).toContain("UX_QUALITY_SKIP=1");
  });
});
