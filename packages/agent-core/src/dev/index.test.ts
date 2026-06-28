import { describe, expect, it } from "vitest";

import { buildChildEnv, resolveVpCommand, resolveWorkspaceBinary } from "./index";

describe("workspace-binary", () => {
  it("resolves a workspace-local binary and the vp runner", () => {
    expect(resolveWorkspaceBinary("/repo", "wrangler")).toBe("/repo/node_modules/.bin/wrangler");
    expect(resolveVpCommand("/repo")).toBe("/repo/node_modules/.bin/vp");
  });

  it("prepends the local bin dir to PATH (or sets it when absent)", () => {
    expect(buildChildEnv("/repo", { PATH: "/usr/bin" }).PATH).toBe(
      "/repo/node_modules/.bin:/usr/bin",
    );
    expect(buildChildEnv("/repo", {}).PATH).toBe("/repo/node_modules/.bin");
  });
});
