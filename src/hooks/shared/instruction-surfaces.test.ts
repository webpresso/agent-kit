import { describe, expect, it } from "vitest";

import {
  INSTRUCTION_SURFACE_HOSTS,
  renderInstructionSurface,
  renderSessionStartInstructionContext,
} from "#hooks/shared/instruction-surfaces";
import { WP_TOOL_NAMES } from "#mcp/tools/_names";

describe("instruction surface renderer", () => {
  it("renders every supported host with the registry-derived tool names", () => {
    const tools = WP_TOOL_NAMES.join(", ");

    for (const host of INSTRUCTION_SURFACE_HOSTS) {
      const surface = renderInstructionSurface({ host });

      expect(surface.content).toContain('source="wp_routing"');
      expect(surface.content).toContain(`<native_tool_names>${tools}</native_tool_names>`);
    }
  });

  it("advertises the session tools in the envelope native_tool_names", () => {
    const surface = renderInstructionSurface({ host: "codex" });

    // Proof markers for the "routing injection" reference-parity row.
    expect(surface.content).toContain("native_tool_names");
    expect(surface.content).toContain("wp_session_batch_execute");
    expect(surface.content).toContain("wp_session_execute_file");
  });

  it("emits empty Claude SessionStart context when there is nothing to surface", () => {
    expect(renderSessionStartInstructionContext({})).toBe("");
  });

  it("joins Claude SessionStart project routing and extra sections without an injected block", () => {
    expect(
      renderSessionStartInstructionContext({
        projectRoutingMarkdown: "project routing",
        extraSections: ["extra context"],
      }),
    ).toBe("project routing\n\nextra context");
  });

  it("renders deterministic Claude instruction metadata for the envelope surface", () => {
    const surface = renderInstructionSurface({
      host: "claude",
      projectRoutingMarkdown: "project routing",
    });

    const tools = WP_TOOL_NAMES.join(", ");

    expect(surface).toStrictEqual({
      host: "claude",
      artifactName: "SessionStart.additionalContext",
      content: `<wp_instruction_surface host="claude" artifact="SessionStart.additionalContext" source="wp_routing">
<host_contract>
<native_tool_names>${tools}</native_tool_names>
<stdout_noop>SessionStart writes a JSON additionalContext envelope; with no project routing or continuity events it emits empty context. Tool routing comes from the wp_* MCP tool descriptions, not an injected block.</stdout_noop>
<lifecycle_notes>
<note>SessionStart is context injection only and cannot block tool calls.</note>
<note>PreToolUse remains the lifecycle for deny decisions.</note>
</lifecycle_notes>
<public_support>Public support: first-class Claude hook context surface.</public_support>
</host_contract>
</wp_instruction_surface>\n\nproject routing`,
    });
  });

  it("renders Codex as an instruction-file artifact with JSON no-op wording", () => {
    const surface = renderInstructionSurface({ host: "codex" });

    expect(surface.artifactName).toBe("AGENTS.md");
    expect(surface.content).toContain("Codex hook commands with no action write {} on stdout");
    expect(surface.content).toContain("durable guidance belongs in AGENTS.md");
    expect(surface.content).toContain("first-class Codex instruction artifact");
    expect(surface.content).toContain(
      "Unsupported managed lifecycle names are documented in the host capability matrix",
    );
  });

  it("renders Cursor command-group differences explicitly for the projected rules surface", () => {
    const surface = renderInstructionSurface({ host: "cursor" });

    expect(surface.artifactName).toBe(
      "agent-rules/webpresso-routing.md -> .cursor/rules/webpresso-routing.mdc",
    );
    expect(surface.content).toContain("Cursor command hooks that do not need to act write {}");
    expect(surface.content).toContain("beforeSubmitPrompt is the prompt-time lifecycle");
    expect(surface.content).toContain("generated Cursor rules surface plus managed hook config");
  });

  it("renders OpenCode degraded bridge support without unscoped plugin framework wording", () => {
    const surface = renderInstructionSurface({ host: "opencode", extraSections: ["bridge note"] });

    expect(surface.artifactName).toBe(".opencode/plugins/webpresso-hooks.js");
    expect(surface.content).toContain(
      "OpenCode plugin callbacks return without writing when there is no action",
    );
    expect(surface.content).toContain("degraded OpenCode plugin bridge");
    expect(surface.content).toContain(
      "Unsupported lifecycle callbacks stay absent unless OpenCode exposes",
    );
    expect(surface.content).toContain("bridge note");
    expect(surface.content).not.toContain("generic plugin");
    expect(surface.content).not.toContain("plugin-style");
  });
});
