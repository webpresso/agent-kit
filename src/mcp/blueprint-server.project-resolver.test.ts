import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { ProjectResolver } from "#project-resolver.js";

import type { ToolHandler, ToolHandlerResult, ToolRegistrar } from "./auto-discover.js";
import { registerBlueprintServer, registerBlueprintTools } from "./blueprint-server.js";

type RegisteredTool = { name: string; handler: ToolHandler };

function makeRegistrar(): { registrar: ToolRegistrar; tools: Map<string, RegisteredTool> } {
  const tools = new Map<string, RegisteredTool>();
  const registrar: ToolRegistrar = {
    registerTool(name, _desc, _schema, _outSchema, handler) {
      tools.set(name, { name, handler });
    },
  };
  return { registrar, tools };
}

async function callTool(
  tools: Map<string, { name: string; handler: ToolHandler }>,
  name: string,
  input: unknown,
): Promise<ToolHandlerResult> {
  const tool = tools.get(name);
  if (!tool) throw new Error(`Tool "${name}" not registered`);
  return tool.handler(input);
}

function parseResult(result: ToolHandlerResult): Record<string, unknown> {
  const text = result.content[0];
  if (!text || text.type !== "text" || typeof text.text !== "string") {
    throw new Error("Expected text content block");
  }
  return JSON.parse(text.text) as Record<string, unknown>;
}

const createdRoots: string[] = [];

afterEach(() => {
  while (createdRoots.length > 0) {
    const root = createdRoots.pop();
    if (!root) continue;
    rmSync(root, { recursive: true, force: true });
  }
});

function mkroot(prefix: string): string {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  createdRoots.push(root);
  return root;
}

describe("blueprint-server project resolver integration", () => {
  it("wp_blueprint_list current-scope path returns structured output without resolver ReferenceErrors", async () => {
    const cwd = mkroot("wp-blueprint-list-");
    const { registrar, tools } = makeRegistrar();

    await registerBlueprintTools(registrar, cwd);

    const payload = parseResult(await callTool(tools, "wp_blueprint_list", {}));
    expect(typeof payload.summary).toBe("string");
    expect(Array.isArray(payload.blueprints)).toBe(true);
  });

  it("wp_blueprint_projects uses the shared resolver-backed discovery path", async () => {
    const cwd = mkroot("wp-blueprint-projects-");
    const { registrar, tools } = makeRegistrar();

    await registerBlueprintServer(registrar, { cwd, existingToolNames: new Set() });

    const payload = parseResult(await callTool(tools, "wp_blueprint_projects", {}));
    expect(typeof payload.summary).toBe("string");
    expect(Array.isArray(payload.projects)).toBe(true);
  });

  it("wp_blueprint_list current-scope path falls back when resolver discovery times out", async () => {
    const oldTimeout = process.env.WP_BLUEPRINT_PROJECT_DISCOVERY_TIMEOUT_MS;
    process.env.WP_BLUEPRINT_PROJECT_DISCOVERY_TIMEOUT_MS = "1";

    const cwd = mkroot("wp-blueprint-list-timeout-");
    const hangingResolver: ProjectResolver = {
      listVisibleProjects: () => new Promise(() => undefined),
      resolve: () => new Promise(() => undefined),
      warm: () => undefined,
      invalidate: () => undefined,
    };

    try {
      const { registrar, tools } = makeRegistrar();
      await registerBlueprintTools(registrar, cwd, hangingResolver);

      const payload = parseResult(await callTool(tools, "wp_blueprint_list", {}));
      expect(typeof payload.summary).toBe("string");
      expect(Array.isArray(payload.blueprints)).toBe(true);
    } finally {
      if (oldTimeout === undefined) delete process.env.WP_BLUEPRINT_PROJECT_DISCOVERY_TIMEOUT_MS;
      else process.env.WP_BLUEPRINT_PROJECT_DISCOVERY_TIMEOUT_MS = oldTimeout;
    }
  });
});
