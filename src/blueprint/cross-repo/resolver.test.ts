import { describe, expect, it } from "vitest";

import { resolvesCrossRepo, bothSidesAllowlistEntries } from "./resolver.js";
import type { AllowlistEntry } from "./resolver.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function allow(source: string, target: string): AllowlistEntry {
  return { source_org: source, permitted_org: target };
}

// ---------------------------------------------------------------------------
// resolvesCrossRepo
// ---------------------------------------------------------------------------

describe("resolvesCrossRepo", () => {
  it("same org always resolves regardless of allowlist", () => {
    expect(resolvesCrossRepo("acme-corp", "acme-corp", [])).toBe(true);
  });

  it("same org resolves even when empty allowlist", () => {
    expect(resolvesCrossRepo("webpresso", "webpresso", [])).toBe(true);
  });

  it("cross-org with empty allowlist → denied", () => {
    expect(resolvesCrossRepo("acme-corp", "other-org", [])).toBe(false);
  });

  it("cross-org with only source→target allowlist (one-side) → denied", () => {
    const allowlist = [allow("acme-corp", "other-org")];
    expect(resolvesCrossRepo("acme-corp", "other-org", allowlist)).toBe(false);
  });

  it("cross-org with only target→source allowlist (one-side) → denied", () => {
    const allowlist = [allow("other-org", "acme-corp")];
    expect(resolvesCrossRepo("acme-corp", "other-org", allowlist)).toBe(false);
  });

  it("cross-org with both-sides mutual allowlist → resolves", () => {
    const allowlist = [allow("acme-corp", "other-org"), allow("other-org", "acme-corp")];
    expect(resolvesCrossRepo("acme-corp", "other-org", allowlist)).toBe(true);
  });

  it("cross-org with 4 orgs — resolves only when both sides present", () => {
    const allowlist = [
      allow("acme-corp", "trusted-partner"),
      allow("trusted-partner", "acme-corp"),
      // random-stranger has no mutual allowlist
    ];
    expect(resolvesCrossRepo("acme-corp", "trusted-partner", allowlist)).toBe(true);
    expect(resolvesCrossRepo("acme-corp", "random-stranger", allowlist)).toBe(false);
    expect(resolvesCrossRepo("trusted-partner", "random-stranger", allowlist)).toBe(false);
    expect(resolvesCrossRepo("other-org", "acme-corp", allowlist)).toBe(false);
  });

  it("symmetric: resolvesCrossRepo(A, B) === resolvesCrossRepo(B, A) for mutual allowlist", () => {
    const allowlist = [
      allow("acme-corp", "trusted-partner"),
      allow("trusted-partner", "acme-corp"),
    ];
    expect(resolvesCrossRepo("acme-corp", "trusted-partner", allowlist)).toBe(true);
    expect(resolvesCrossRepo("trusted-partner", "acme-corp", allowlist)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// bothSidesAllowlistEntries
// ---------------------------------------------------------------------------

describe("bothSidesAllowlistEntries", () => {
  it("returns false when allowlist is empty", () => {
    expect(bothSidesAllowlistEntries("acme-corp", "other-org", [])).toBe(false);
  });

  it("returns false with one-side-only entry", () => {
    expect(
      bothSidesAllowlistEntries("acme-corp", "other-org", [allow("acme-corp", "other-org")]),
    ).toBe(false);
  });

  it("returns true with both-sides entries", () => {
    const allowlist = [allow("acme-corp", "other-org"), allow("other-org", "acme-corp")];
    expect(bothSidesAllowlistEntries("acme-corp", "other-org", allowlist)).toBe(true);
  });
});
