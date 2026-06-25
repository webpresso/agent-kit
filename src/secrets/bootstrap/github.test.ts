import { describe, expect, it } from "vitest";

import { buildGitHubBootstrapActionPlan } from "./github.js";

describe("github bootstrap action plan", () => {
  it("defaults verify to dry-run", () => {
    expect(
      buildGitHubBootstrapActionPlan("verify", {
        mode: "service-token",
        lanes: ["preview_main"],
        requiredSecrets: ["CI_SECRET_PROVIDER_TOKEN_PREVIEW"],
      }),
    ).toEqual({
      op: "verify",
      requiredSecrets: ["CI_SECRET_PROVIDER_TOKEN_PREVIEW"],
      dryRun: true,
    });
  });
});
