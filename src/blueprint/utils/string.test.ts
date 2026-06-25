import { describe, expect, it } from "vitest";

import { escapeRegExp, escapeRegex } from "./string.js";

describe("regex string helpers", () => {
  it("escapes all regex metacharacters including asterisks", () => {
    expect(escapeRegex("a*b")).toBe("a\\*b");
    expect(escapeRegExp("a*b")).toBe("a\\*b");
  });
});
