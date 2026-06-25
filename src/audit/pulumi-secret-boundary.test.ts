import { describe, expect, it } from "vitest";

import { auditPulumiSecretBoundary } from "./pulumi-secret-boundary.js";

describe("pulumi secret boundary audit", () => {
  it("passes when no forbidden Pulumi secret mutation is required", () => {
    expect(auditPulumiSecretBoundary().ok).toBe(true);
  });
});
