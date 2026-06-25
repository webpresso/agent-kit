import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { validateAgentOverlays } from "./overlay-loader.js";

describe("overlay sync integration contract", () => {
  let root: string;

  beforeEach(() => {
    root = join(
      tmpdir(),
      `wp-overlay-integration-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(join(root, "agent-overlays", "codex"), { recursive: true });
    mkdirSync(join(root, "agent-overlays", "claude"), { recursive: true });
    for (const cli of ["codex", "claude"]) {
      writeFileSync(join(root, "agent-overlays", cli, "evidence.md"), "# evidence\n");
      writeFileSync(join(root, "agent-overlays", cli, "prompt.md"), "# prompt\n");
      writeFileSync(
        join(root, "agent-overlays", cli, "manifest.yaml"),
        `version: 1\ncli: ${cli}\nsurfaces: [generated-agent-surfaces]\nevidence: [evidence.md]\nfiles:\n  - source: prompt.md\n    target: shared/prompt.md\n`,
      );
    }
  });

  afterEach(async () => {
    await import("node:fs/promises").then((fs) => fs.rm(root, { recursive: true, force: true }));
  });

  it("blocks target collisions before wp sync can merge overlays", () => {
    const result = validateAgentOverlays(root);

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      {
        file: "agent-overlays/codex/manifest.yaml",
        message: "Overlay target collision for shared/prompt.md: claude and codex",
      },
    ]);
  });
});
