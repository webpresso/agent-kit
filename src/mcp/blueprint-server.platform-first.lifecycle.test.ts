import { afterEach, describe, expect, it, vi } from "vitest";

import { callTool, parseResult } from "./blueprint-server.test-harness.js";
import {
  PROMOTE_BLUEPRINT,
  PROMOTE_TO_COMPLETED_BLUEPRINT,
  PROMOTE_TO_COMPLETED_BLUEPRINT_UNVERIFIED,
  installMockSyncAdapter,
  makePlatformBlueprintHarness,
  resetPlatformFirstTestState,
} from "./blueprint-server.platform-first.test-harness.js";
import { withApprovalFrontmatter } from "./blueprint-server.test-harness.js";

const PROMOTE_TO_COMPLETED_ZERO_TASK_BLUEPRINT = `---
type: blueprint
title: Promote Completed Zero Task Blueprint
status: planned
complexity: S
owner: tester
created: '2026-01-01'
last_updated: '2026-05-01'
---

## Product wedge anchor

- **Stage outcome:** Phase 1 — complete promote feature
- **Consuming surface:** /promote route
- **New user-visible capability:** Users can promote blueprints to completed.

## Summary

Blueprint used to test zero-task completed promotion rejection.
`;

describe("wp_blueprint_promote — platform-first", () => {
  const tempDirs: string[] = [];
  const promoteSlug = "promote-test-blueprint";

  afterEach(() => {
    resetPlatformFirstTestState(tempDirs);
    tempDirs.splice(0);
  });

  async function setupWithPromoteBlueprint() {
    const harness = await makePlatformBlueprintHarness({
      prefix: "wp-bs-prm-",
      stateDir: "draft",
      slug: promoteSlug,
      content: withApprovalFrontmatter(PROMOTE_BLUEPRINT),
      approvalLedger: true,
      validate: true,
    });
    tempDirs.push(harness.tmpDir);
    return harness;
  }

  it("calls pushEvent + ensureFresh when platform adapter is available", async () => {
    const { pushEvent, ensureFresh } = installMockSyncAdapter();
    const { tools } = await setupWithPromoteBlueprint();

    const result = await callTool(tools, "wp_blueprint_promote", {
      slug: promoteSlug,
      to_state: "planned",
    });
    const data = parseResult<{
      slug: string;
      from_state: string;
      to_state: string;
    }>(result);

    expect(result.isError).toStrictEqual(false);
    expect(data.slug).toStrictEqual(promoteSlug);
    expect(data.from_state).toStrictEqual("draft");
    expect(data.to_state).toStrictEqual("planned");

    expect(pushEvent).toHaveBeenCalledOnce();
    const [eventArg] = pushEvent.mock.calls[0] ?? [];
    expect(eventArg?.type).toStrictEqual("blueprint.status_changed");
    expect(eventArg?.payload).toMatchObject({
      type: "blueprint.status_changed",
      slug: promoteSlug,
      fromStatus: "draft",
      toStatus: "planned",
    });
    expect(typeof eventArg?.eventId).toStrictEqual("string");
    expect(eventArg?.eventId.length).toBeGreaterThan(0);
    expect(ensureFresh).toHaveBeenCalledTimes(2);
  });

  it("does NOT call pushEvent when WP_BLUEPRINT_PLATFORM_DISABLED=1", async () => {
    vi.stubEnv("WP_BLUEPRINT_PLATFORM_DISABLED", "1");
    const { pushEvent, ensureFresh } = installMockSyncAdapter();
    const { tools } = await setupWithPromoteBlueprint();

    const result = await callTool(tools, "wp_blueprint_promote", {
      slug: promoteSlug,
      to_state: "planned",
    });
    const data = parseResult<{ to_state: string; failures: string[] }>(result);

    expect(result.isError).toStrictEqual(false);
    expect(data.to_state).toStrictEqual("planned");
    expect(data.failures).toHaveLength(0);
    expect(pushEvent).not.toHaveBeenCalled();
    expect(ensureFresh).not.toHaveBeenCalled();
  });

  it("refuses to promote to completed when done tasks lack task-local verification", async () => {
    const { pushEvent, ensureFresh } = installMockSyncAdapter();
    const harness = await makePlatformBlueprintHarness({
      prefix: "wp-bs-prm-comp-unverified-",
      stateDir: "in-progress",
      slug: "promote-completed-unverified-blueprint",
      content: PROMOTE_TO_COMPLETED_BLUEPRINT_UNVERIFIED,
      validate: true,
    });
    tempDirs.push(harness.tmpDir);

    const result = await callTool(harness.tools, "wp_blueprint_promote", {
      slug: "promote-completed-unverified-blueprint",
      to_state: "completed",
    });

    expect(result.isError).toStrictEqual(true);
    expect(result.content[0]?.text).toMatch(/missing task-local canonical verification evidence/i);
    expect(pushEvent).not.toHaveBeenCalled();
    expect(ensureFresh).toHaveBeenCalledOnce();
  });

  it("refuses to promote a zero-task planned blueprint to completed", async () => {
    const { pushEvent, ensureFresh } = installMockSyncAdapter();
    const harness = await makePlatformBlueprintHarness({
      prefix: "wp-bs-prm-comp-zero-task-",
      stateDir: "planned",
      slug: "promote-completed-zero-task-blueprint",
      content: PROMOTE_TO_COMPLETED_ZERO_TASK_BLUEPRINT,
      validate: true,
    });
    tempDirs.push(harness.tmpDir);

    const result = await callTool(harness.tools, "wp_blueprint_promote", {
      slug: "promote-completed-zero-task-blueprint",
      to_state: "completed",
    });

    expect(result.isError).toStrictEqual(true);
    expect(result.content[0]?.text).toMatch(/zero-task|0 tasks|no tasks/i);
    expect(pushEvent).not.toHaveBeenCalled();
    expect(ensureFresh).toHaveBeenCalledOnce();
  });

  it("allows promote to completed when all tasks are done and verified", async () => {
    const { pushEvent, ensureFresh } = installMockSyncAdapter();
    const harness = await makePlatformBlueprintHarness({
      prefix: "wp-bs-prm-comp-verified-",
      stateDir: "in-progress",
      slug: "promote-completed-verified-blueprint",
      content: PROMOTE_TO_COMPLETED_BLUEPRINT,
      validate: true,
    });
    tempDirs.push(harness.tmpDir);

    const result = await callTool(harness.tools, "wp_blueprint_promote", {
      slug: "promote-completed-verified-blueprint",
      to_state: "completed",
    });
    const data = parseResult<{ slug: string; to_state: string; failures: string[] }>(result);

    expect(result.isError).toStrictEqual(false);
    expect(data.slug).toStrictEqual("promote-completed-verified-blueprint");
    expect(data.to_state).toStrictEqual("completed");
    expect(data.failures).toHaveLength(0);
    expect(pushEvent).toHaveBeenCalledOnce();
    expect(ensureFresh).toHaveBeenCalledTimes(2);
  });
});
