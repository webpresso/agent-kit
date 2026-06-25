import { describe, expect, it } from "vitest";
import { parseTrustDossier } from "./dossier.js";

import { VALID_DOSSIER } from "./test-fixtures.js";
describe("parseTrustDossier", () => {
  it("parses a valid dossier", () => {
    const result = parseTrustDossier(VALID_DOSSIER);
    expect(result.violations).toEqual([]);
    expect(result.dossier?.readiness.promotionReady).toBe(true);
    expect(result.dossier?.claims[0]?.id).toBe("C1");
  });

  it("reports missing dossier and ignores fenced examples", () => {
    const result = parseTrustDossier("```md\n## Trust Dossier\n```");
    expect(result.violations[0]?.section).toBe("Trust Dossier");
  });

  it("rejects placeholders", () => {
    const result = parseTrustDossier(VALID_DOSSIER.replace("Parser exists", "<claim>"));
    expect(result.violations.some((v) => v.message.includes("placeholder"))).toBe(true);
  });
});
