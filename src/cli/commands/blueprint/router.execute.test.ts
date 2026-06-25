import { afterEach, describe, expect, it, vi } from "vitest";

import {
  _setBlueprintExecCommandExistsForTests,
  _setBlueprintExecStarterForTests,
  executeBlueprint,
} from "./router.js";

afterEach(() => {
  _setBlueprintExecCommandExistsForTests(null);
  _setBlueprintExecStarterForTests(null);
});

describe("executeBlueprint preflight", () => {
  it("fails before lifecycle mutation when omx is unavailable", async () => {
    const starter = vi.fn();
    _setBlueprintExecCommandExistsForTests(() => false);
    _setBlueprintExecStarterForTests(starter);

    await expect(executeBlueprint("demo-slug", { projectRoot: "/tmp/repo" })).rejects.toThrow(
      /wp setup --with omx/,
    );
    expect(starter).not.toHaveBeenCalled();
  });
});
