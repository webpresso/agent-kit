import { describe, expect, it } from "vitest";

import { isWebpressoOwnedCodexHook, KNOWN_WEBPRESSO_CODEX_BINS } from "./codex-ownership.js";

const EXPECTED_SOURCE_PATHS = ["/repo/.codex/hooks.json", "/repo/.codex/extra-hooks.json"] as const;

function ownedHook(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    isManaged: false,
    handlerType: "command",
    pluginId: null,
    sourcePath: EXPECTED_SOURCE_PATHS[0],
    command: "node /pkg/bin/wp hook pretool-guard # wp-pretool-guard",
    ...overrides,
  };
}

describe("isWebpressoOwnedCodexHook", () => {
  it("accepts unmanaged command hooks from expected source paths that target direct wp hook commands", () => {
    for (const binName of KNOWN_WEBPRESSO_CODEX_BINS) {
      expect(
        isWebpressoOwnedCodexHook(
          ownedHook({ command: `node /pkg/bin/wp hook ${binName.slice(3)} # ${binName}` }),
          EXPECTED_SOURCE_PATHS,
        ),
      ).toBe(true);
    }
  });

  it("accepts direct commands with absolute wp launcher paths", () => {
    expect(
      isWebpressoOwnedCodexHook(
        ownedHook({
          command:
            "/usr/bin/node /repo/node_modules/@webpresso/agent-kit/bin/wp hook post-tool # wp-post-tool",
        }),
        EXPECTED_SOURCE_PATHS,
      ),
    ).toBe(true);
  });

  it("rejects arbitrary Bash and Python hook commands", () => {
    expect(
      isWebpressoOwnedCodexHook(
        ownedHook({ command: "bash .codex/hooks/pre-tool.sh" }),
        EXPECTED_SOURCE_PATHS,
      ),
    ).toBe(false);
    expect(
      isWebpressoOwnedCodexHook(
        ownedHook({ command: "python .codex/hooks/post-tool.py" }),
        EXPECTED_SOURCE_PATHS,
      ),
    ).toBe(false);
  });

  it("rejects managed hooks, non-command handlers, and plugin-owned hooks", () => {
    expect(isWebpressoOwnedCodexHook(ownedHook({ isManaged: true }), EXPECTED_SOURCE_PATHS)).toBe(
      false,
    );
    expect(
      isWebpressoOwnedCodexHook(ownedHook({ handlerType: "python" }), EXPECTED_SOURCE_PATHS),
    ).toBe(false);
    expect(
      isWebpressoOwnedCodexHook(
        ownedHook({ pluginId: "webpresso.webpresso" }),
        EXPECTED_SOURCE_PATHS,
      ),
    ).toBe(false);
  });

  it("rejects metadata without the required unmanaged plugin-null shape", () => {
    expect(
      isWebpressoOwnedCodexHook(ownedHook({ isManaged: undefined }), EXPECTED_SOURCE_PATHS),
    ).toBe(false);
    expect(
      isWebpressoOwnedCodexHook(ownedHook({ pluginId: undefined }), EXPECTED_SOURCE_PATHS),
    ).toBe(false);
  });

  it("rejects unrelated source paths and missing commands", () => {
    expect(
      isWebpressoOwnedCodexHook(
        ownedHook({ sourcePath: "/tmp/unrelated/hooks.json" }),
        EXPECTED_SOURCE_PATHS,
      ),
    ).toBe(false);
    expect(
      isWebpressoOwnedCodexHook(ownedHook({ command: undefined }), EXPECTED_SOURCE_PATHS),
    ).toBe(false);
  });

  it("rejects commands that do not directly target known direct wp hook commands", () => {
    expect(
      isWebpressoOwnedCodexHook(
        ownedHook({ command: "python .codex/hooks/wp-pretool-guard.py" }),
        EXPECTED_SOURCE_PATHS,
      ),
    ).toBe(false);
    expect(
      isWebpressoOwnedCodexHook(
        ownedHook({ command: "ak hook pretool-guard" }),
        EXPECTED_SOURCE_PATHS,
      ),
    ).toBe(false);
    expect(
      isWebpressoOwnedCodexHook(
        ownedHook({ command: "echo wp-pretool-guard" }),
        EXPECTED_SOURCE_PATHS,
      ),
    ).toBe(false);
  });

  it("rejects malformed metadata and empty expected source allowlists", () => {
    expect(isWebpressoOwnedCodexHook(null, EXPECTED_SOURCE_PATHS)).toBe(false);
    expect(isWebpressoOwnedCodexHook("not metadata", EXPECTED_SOURCE_PATHS)).toBe(false);
    expect(isWebpressoOwnedCodexHook(ownedHook(), [])).toBe(false);
  });
});
