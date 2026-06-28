import { describe, expect, it } from "vitest";

import { orderWorkspacePackagesForRelease } from "./workspace-release-order";

describe("orderWorkspacePackagesForRelease", () => {
  it("builds local dependencies before dependents instead of alphabetically", () => {
    const ordered = orderWorkspacePackagesForRelease([
      { name: "@webpresso/agent-config", workspaceDependencies: ["@webpresso/agent-core"] },
      { name: "@webpresso/agent-core", workspaceDependencies: [] },
    ]);

    expect(ordered.map((pkg) => pkg.name)).toEqual([
      "@webpresso/agent-core",
      "@webpresso/agent-config",
    ]);
  });

  it("keeps independent packages deterministic by name", () => {
    const ordered = orderWorkspacePackagesForRelease([
      { name: "@webpresso/zeta", workspaceDependencies: [] },
      { name: "@webpresso/alpha", workspaceDependencies: [] },
    ]);

    expect(ordered.map((pkg) => pkg.name)).toEqual(["@webpresso/alpha", "@webpresso/zeta"]);
  });

  it("throws on cycles instead of silently publishing in a broken order", () => {
    expect(() =>
      orderWorkspacePackagesForRelease([
        { name: "@webpresso/a", workspaceDependencies: ["@webpresso/b"] },
        { name: "@webpresso/b", workspaceDependencies: ["@webpresso/a"] },
      ]),
    ).toThrow(/cycle or unresolved local dependency/i);
  });
});
