import { describe, expect, it } from "vitest";

import {
  CommandHookMetadataSchema,
  ConfigBatchWriteParamsSchema,
  ConfigBatchWriteResponseSchema,
  HooksListResponseSchema,
  JsonRpcErrorSchema,
  parseCommandHookMetadata,
} from "./types.js";

const readmeHookMetadata = {
  key: "/Users/me/.codex/config.toml:pre_tool_use:0:0",
  eventName: "pre_tool_use",
  handlerType: "command",
  isManaged: false,
  matcher: "Bash",
  command: "python3 /Users/me/hook.py",
  timeoutSec: 5,
  statusMessage: "running hook",
  sourcePath: "/Users/me/.codex/config.toml",
  source: "user",
  pluginId: null,
  displayOrder: 0,
  enabled: true,
  currentHash: "sha256:...",
  trustStatus: "untrusted",
};

describe("HooksListResponseSchema", () => {
  it("parses README-style hook metadata with JSON numeric fields intact", () => {
    const parsed = HooksListResponseSchema.parse({
      data: [
        {
          cwd: "/Users/me/project",
          hooks: [readmeHookMetadata],
          warnings: [],
          errors: [],
        },
      ],
    });

    const hook = parsed.data[0]?.hooks[0];
    expect(hook?.key).toBe("/Users/me/.codex/config.toml:pre_tool_use:0:0");
    expect(hook?.timeoutSec).toBe(5);
    expect(hook?.displayOrder).toBe(0);
    expect(hook?.currentHash).toBe("sha256:...");
  });

  it("accepts camelCase event names from the live app-server and normalizes them", () => {
    const parsed = HooksListResponseSchema.parse({
      data: [
        {
          cwd: "/Users/me/project",
          hooks: [{ ...readmeHookMetadata, eventName: "preToolUse" }],
          warnings: [],
          errors: [],
        },
      ],
    });

    expect(parsed.data[0]?.hooks[0]?.eventName).toBe("pre_tool_use");
  });

  it("accepts unrelated event names from hooks/list without rejecting the payload", () => {
    const parsed = HooksListResponseSchema.parse({
      data: [
        {
          cwd: "/Users/me/project",
          hooks: [{ ...readmeHookMetadata, eventName: "preCompact" }],
          warnings: [],
          errors: [],
        },
      ],
    });

    expect(parsed.data[0]?.hooks[0]?.eventName).toBe("preCompact");
  });

  it("requires key and currentHash so trust state updates are addressable", () => {
    expect(() =>
      HooksListResponseSchema.parse({
        data: [
          {
            cwd: "/x",
            hooks: [{ ...readmeHookMetadata, key: undefined }],
            warnings: [],
            errors: [],
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      HooksListResponseSchema.parse({
        data: [
          {
            cwd: "/x",
            hooks: [{ ...readmeHookMetadata, currentHash: undefined }],
            warnings: [],
            errors: [],
          },
        ],
      }),
    ).toThrow();
  });

  it("validates trust status values", () => {
    expect(
      HooksListResponseSchema.parse({
        data: [
          {
            cwd: "/x",
            hooks: [{ ...readmeHookMetadata, trustStatus: "trusted" }],
            warnings: [],
            errors: [],
          },
        ],
      }).data[0]?.hooks[0]?.trustStatus,
    ).toBe("trusted");
    expect(
      HooksListResponseSchema.parse({
        data: [
          {
            cwd: "/x",
            hooks: [{ ...readmeHookMetadata, trustStatus: "modified" }],
            warnings: [],
            errors: [],
          },
        ],
      }).data[0]?.hooks[0]?.trustStatus,
    ).toBe("modified");
    expect(() =>
      HooksListResponseSchema.parse({
        data: [
          {
            cwd: "/x",
            hooks: [{ ...readmeHookMetadata, trustStatus: "firstSeen" }],
            warnings: [],
            errors: [],
          },
        ],
      }),
    ).toThrow();
  });
});

describe("CommandHookMetadataSchema", () => {
  it("accepts command hooks and rejects non-command hooks", () => {
    expect(CommandHookMetadataSchema.parse(readmeHookMetadata).command).toBe(
      "python3 /Users/me/hook.py",
    );
    expect(() =>
      parseCommandHookMetadata({ ...readmeHookMetadata, handlerType: "prompt", command: null }),
    ).toThrow("Expected command hook metadata");
  });
});

describe("ConfigBatchWriteParamsSchema", () => {
  it("parses hook state upserts used to enable or disable hooks", () => {
    expect(
      ConfigBatchWriteParamsSchema.parse({
        edits: [
          {
            keyPath: "hooks.state",
            value: {
              "/Users/me/.codex/config.toml:pre_tool_use:0:0": { enabled: false },
            },
            mergeStrategy: "upsert",
          },
        ],
        reloadUserConfig: true,
      }),
    ).toMatchObject({
      edits: [{ keyPath: "hooks.state", mergeStrategy: "upsert" }],
      reloadUserConfig: true,
    });
  });
});

describe("ConfigBatchWriteResponseSchema", () => {
  it("accepts metadata-rich success payloads from the live app-server", () => {
    expect(
      ConfigBatchWriteResponseSchema.parse({
        status: "ok",
        version: "sha256:abc123",
        filePath: "/Users/me/.codex/config.toml",
        overriddenMetadata: null,
      }),
    ).toMatchObject({
      status: "ok",
      version: "sha256:abc123",
      filePath: "/Users/me/.codex/config.toml",
      overriddenMetadata: null,
    });
  });
});

describe("JsonRpcErrorSchema", () => {
  it("parses minimal JSON-RPC error objects without requiring the omitted jsonrpc header", () => {
    expect(
      JsonRpcErrorSchema.parse({
        code: -32602,
        message: "Invalid params",
        data: { field: "cwds" },
      }),
    ).toEqual({
      code: -32602,
      message: "Invalid params",
      data: { field: "cwds" },
    });
  });
});
