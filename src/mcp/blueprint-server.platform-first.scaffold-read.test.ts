import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  callTool,
  cleanupTempDir,
  makeEmptyProjectionBlueprintHarness,
  parseResult,
  type ToolMap,
} from "./blueprint-server.test-harness.js";
import {
  installMockSyncAdapter,
  makePlatformHarness,
  resetPlatformFirstTestState,
} from "./blueprint-server.platform-first.test-harness.js";

describe("wp_blueprint_new — platform-first", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    resetPlatformFirstTestState(tempDirs);
    tempDirs.splice(0);
  });

  async function setup() {
    const harness = await makePlatformHarness("wp-bs-new-");
    tempDirs.push(harness.tmpDir);
    return harness;
  }

  it("pushes blueprint.created event before returning scaffold when adapter is available", async () => {
    const { pushEvent, ensureFresh } = installMockSyncAdapter();
    const { tools } = await setup();

    const result = await callTool(tools, "wp_blueprint_new", {
      title: "Platform New Feature",
      complexity: "M",
      goal_prompt: "Register this blueprint with the platform.",
    });
    const data = parseResult<{
      target_path: string;
      template: string;
    }>(result);

    expect(result.isError).toStrictEqual(false);
    expect(data.target_path).toMatch(/\.md$/);
    expect(data.template).toContain("Platform New Feature");

    expect(pushEvent).toHaveBeenCalledOnce();
    const [eventArg] = pushEvent.mock.calls[0] ?? [];
    expect(eventArg?.type).toStrictEqual("blueprint.created");
    expect(eventArg?.payload).toMatchObject({
      type: "blueprint.created",
      slug: "platform-new-feature",
      title: "Platform New Feature",
      complexity: "M",
      status: "draft",
    });
    expect(typeof eventArg?.eventId).toStrictEqual("string");
    expect(eventArg?.eventId.length).toBeGreaterThan(0);
    expect(ensureFresh).not.toHaveBeenCalled();
  });

  it("does NOT call pushEvent when WP_BLUEPRINT_PLATFORM_DISABLED=1", async () => {
    vi.stubEnv("WP_BLUEPRINT_PLATFORM_DISABLED", "1");
    const { pushEvent, ensureFresh } = installMockSyncAdapter();
    const { tools } = await setup();

    const result = await callTool(tools, "wp_blueprint_new", {
      title: "Disabled New Feature",
      goal_prompt: "Should not push event.",
    });
    const data = parseResult<{ failures: string[] }>(result);

    expect(result.isError).toStrictEqual(false);
    expect(data.failures).toHaveLength(0);
    expect(pushEvent).not.toHaveBeenCalled();
    expect(ensureFresh).not.toHaveBeenCalled();
  });
});

describe("wp_blueprint_task_next — ensureFresh-before-read", () => {
  const tempDirs: string[] = [];
  let tmpDir: string;
  let tools: ToolMap;

  beforeAll(async () => {
    ({ tmpDir, tools } = await makeEmptyProjectionBlueprintHarness("wp-bs-next-"));
  });

  afterEach(() => {
    resetPlatformFirstTestState(tempDirs);
  });

  afterAll(() => {
    cleanupTempDir(tmpDir);
  });

  it("calls ensureFresh before reading when adapter is available", async () => {
    const { pushEvent, ensureFresh } = installMockSyncAdapter();

    const result = await callTool(tools, "wp_blueprint_task_next", {});
    const data = parseResult<{ task: unknown }>(result);

    expect(result.isError).toStrictEqual(false);
    expect(data.task).toBeNull();
    expect(ensureFresh).toHaveBeenCalledOnce();
    expect(pushEvent).not.toHaveBeenCalled();
  });

  it("calls ensureFresh with slug when blueprint filter is specified", async () => {
    const { pushEvent, ensureFresh } = installMockSyncAdapter();

    const result = await callTool(tools, "wp_blueprint_task_next", {
      blueprint: "some-slug",
    });

    expect(result.isError).toStrictEqual(false);
    expect(ensureFresh).toHaveBeenCalledOnce();
    expect(ensureFresh).toHaveBeenCalledWith({ slug: "some-slug" });
    expect(pushEvent).not.toHaveBeenCalled();
  });

  it("does NOT call ensureFresh when WP_BLUEPRINT_PLATFORM_DISABLED=1", async () => {
    vi.stubEnv("WP_BLUEPRINT_PLATFORM_DISABLED", "1");
    const { pushEvent, ensureFresh } = installMockSyncAdapter();

    const result = await callTool(tools, "wp_blueprint_task_next", {});
    const data = parseResult<{ task: unknown }>(result);

    expect(result.isError).toStrictEqual(false);
    expect(data.task).toBeNull();
    expect(ensureFresh).not.toHaveBeenCalled();
    expect(pushEvent).not.toHaveBeenCalled();
  });

  it("falls back to local replica when ensureFresh times out", async () => {
    vi.stubEnv("WP_BLUEPRINT_READ_FRESH_TIMEOUT_MS", "1");
    const { pushEvent, ensureFresh } = installMockSyncAdapter();
    ensureFresh.mockImplementation(() => new Promise<void>(() => {}));

    const result = await callTool(tools, "wp_blueprint_task_next", {});
    const data = parseResult<{ task: unknown; failures: string[] }>(result);

    expect(result.isError).toStrictEqual(false);
    expect(data.task).toBeNull();
    expect(data.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Platform freshness refresh skipped: ensureFresh timed out"),
      ]),
    );
    expect(ensureFresh).toHaveBeenCalledOnce();
    expect(pushEvent).not.toHaveBeenCalled();
  });
});
