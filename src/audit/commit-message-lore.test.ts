import { describe, expect, it } from "vitest";

import { validateLoreTrailers } from "./commit-message-lore.js";

const FULL_LORE_COMMIT = `Prevent silent session drops during long-running operations

The auth service returns inconsistent status codes on token
expiry, so the interceptor catches all 4xx responses.

Constraint: Auth service does not support token introspection
Rejected: Extend token TTL | security policy violation
Confidence: high
Scope-risk: narrow
Directive: Error handling is broad — do not narrow without verifying upstream
Tested: Single expired token refresh (unit)
Not-tested: Auth service cold-start behavior`;

describe("validateLoreTrailers", () => {
  describe("--require-lore mode (hard-fail)", () => {
    it("passes a commit with all required trailers", () => {
      const result = validateLoreTrailers(FULL_LORE_COMMIT, { requireLore: true });
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it("fails when Confidence trailer is missing", () => {
      const msg = `Fix a bug\n\nConfidence-less commit.\n\nConstraint: some constraint\nScope-risk: narrow\nDirective: some directive\nTested: unit`;
      const result = validateLoreTrailers(msg, { requireLore: true });
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => /Confidence/i.test(v))).toBe(true);
    });

    it("fails when no Constraint:, Rejected:, or Directive: trailer is present", () => {
      const msg = `Fix a bug\n\nSome context.\n\nConfidence: medium\nScope-risk: narrow\nTested: unit`;
      const result = validateLoreTrailers(msg, { requireLore: true });
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => /Constraint|Rejected|Directive/i.test(v))).toBe(true);
    });

    it("fails when Confidence has an invalid value", () => {
      const msg = `Fix a bug\n\nContext.\n\nConstraint: some constraint\nConfidence: yolo\nScope-risk: narrow\nDirective: some directive\nTested: unit`;
      const result = validateLoreTrailers(msg, { requireLore: true });
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => /Confidence/i.test(v))).toBe(true);
    });

    it("fails when Scope-risk has an invalid value", () => {
      const msg = `Fix a bug\n\nContext.\n\nConstraint: some constraint\nConfidence: high\nScope-risk: galaxy-brain\nDirective: some directive\nTested: unit`;
      const result = validateLoreTrailers(msg, { requireLore: true });
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => /Scope-risk/i.test(v))).toBe(true);
    });
  });

  describe("--lore-warn mode (soft fail)", () => {
    it("returns valid=true even when Confidence is missing", () => {
      const msg = `Fix a bug\n\nConstraint: some constraint\nScope-risk: narrow\nTested: unit`;
      const result = validateLoreTrailers(msg, { loreWarn: true });
      expect(result.valid).toBe(true); // warn mode: always valid
      expect(result.warnings.length).toBeGreaterThan(0); // but warnings present
      expect(result.warnings.some((w) => /Confidence/i.test(w))).toBe(true);
    });

    it("returns valid=false for malformed Confidence even in warn mode", () => {
      const msg = `Fix a bug\n\nConstraint: some constraint\nConfidence: yolo\nScope-risk: narrow\nTested: unit`;
      const result = validateLoreTrailers(msg, { loreWarn: true });
      expect(result.valid).toBe(false); // malformed values always fail
      expect(result.violations.some((v) => /Confidence/i.test(v))).toBe(true);
    });
  });

  describe("off by default", () => {
    it("returns valid with no violations when neither flag is set", () => {
      const msg = `Fix a bug\n\nNo lore trailers at all.`;
      const result = validateLoreTrailers(msg, {});
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });
  });
});
