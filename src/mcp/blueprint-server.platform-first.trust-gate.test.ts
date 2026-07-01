import { afterEach, describe, expect, it } from "vitest";

import { callTool, parseResult, withApprovalFrontmatter } from "./blueprint-server.test-harness.js";
import {
  PROMOTE_BLUEPRINT,
  installMockSyncAdapter,
  makePlatformBlueprintHarness,
  resetPlatformFirstTestState,
} from "./blueprint-server.platform-first.test-harness.js";

describe("wp_blueprint_promote — planned trust gate ordering", () => {
  const tempDirs: string[] = [];

  afterEach(() => resetPlatformFirstTestState(tempDirs.splice(0)));

  it("does not publish platform status changes when the planned trust gate fails", async () => {
    const { pushEvent, ensureFresh } = installMockSyncAdapter();
    const harness = await makePlatformBlueprintHarness({
      prefix: "wp-bs-prm-trust-fail-",
      stateDir: "draft",
      slug: "promote-trust-fail-blueprint",
      content: PROMOTE_BLUEPRINT.replace("## Trust Dossier", "## Missing Trust Dossier"),
      validate: true,
    });
    tempDirs.push(harness.tmpDir);

    const result = await callTool(harness.tools, "wp_blueprint_promote", {
      slug: "promote-trust-fail-blueprint",
      to_state: "planned",
    });

    expect(result.isError).toStrictEqual(true);
    expect(result.content[0]?.text).toMatch(/Trust Dossier/i);
    expect(pushEvent).not.toHaveBeenCalled();
    expect(ensureFresh).toHaveBeenCalledOnce();
  });

  it("calls pushEvent + ensureFresh for revision-token planned transition", async () => {
    const { pushEvent, ensureFresh } = installMockSyncAdapter();
    const harness = await makePlatformBlueprintHarness({
      prefix: "wp-bs-prm-trust-transition-",
      stateDir: "draft",
      slug: "promote-trust-transition-blueprint",
      content: withApprovalFrontmatter(PROMOTE_BLUEPRINT),
      approvalLedger: true,
      validate: true,
    });
    tempDirs.push(harness.tmpDir);
    const getResult = await callTool(harness.tools, "wp_blueprint_get", {
      slug: "promote-trust-transition-blueprint",
    });
    const before = parseResult<{ content_hash: string }>(getResult);

    const result = await callTool(harness.tools, "wp_blueprint_transition", {
      project_id: harness.tmpDir,
      slug: "promote-trust-transition-blueprint",
      to_state: "planned",
      expected_version: before.content_hash,
    });
    const data = parseResult<{ slug: string; new_status: string; failures: string[] }>(result);

    expect(result.isError).toStrictEqual(false);
    expect(data).toMatchObject({
      slug: "promote-trust-transition-blueprint",
      new_status: "planned",
      failures: [],
    });
    expect(pushEvent).toHaveBeenCalledOnce();
    expect(pushEvent.mock.calls[0]?.[0]?.payload).toMatchObject({
      type: "blueprint.status_changed",
      slug: "promote-trust-transition-blueprint",
      fromStatus: "draft",
      toStatus: "planned",
    });
    expect(ensureFresh).toHaveBeenCalledTimes(2);
  });
});
