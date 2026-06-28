import { describe, expect, it } from "vitest";

import { assertSemanticReleaseVersion, validateReleaseMetadata } from "./index";

describe("release-version validation", () => {
  it("accepts valid semver (incl. prerelease/build)", () => {
    expect(assertSemanticReleaseVersion("0.1.0")).toBe("0.1.0");
    expect(assertSemanticReleaseVersion("1.2.3-rc.1")).toBe("1.2.3-rc.1");
  });

  it("rejects non-semver / missing / malformed identifiers", () => {
    for (const bad of ["", "v1.0.0", "1.2", "01.2.3", "1.2.3-..", "1.2.3+."]) {
      expect(() => assertSemanticReleaseVersion(bad)).toThrow(/semantic release version/u);
    }
  });

  it("passes on match, throws version mismatch otherwise", () => {
    expect(() =>
      validateReleaseMetadata({ requested: "0.1.0", metadataVersion: "0.1.0" }),
    ).not.toThrow();
    expect(() => validateReleaseMetadata({ requested: "9.9.9", metadataVersion: "0.1.0" })).toThrow(
      /version mismatch/u,
    );
  });
});
