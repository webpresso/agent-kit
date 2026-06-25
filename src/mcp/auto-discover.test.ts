import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { discoverTools, registerToolDescriptors, type ToolDescriptor } from "./auto-discover.js";

interface RegisteredCall {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  handler: ToolDescriptor["handler"];
}

function makeFakeServer() {
  const calls: RegisteredCall[] = [];
  return {
    calls,
    server: {
      registerTool(
        name: string,
        description: string,
        inputSchema: Record<string, unknown>,
        outputSchema: Record<string, unknown> | undefined,
        handler: ToolDescriptor["handler"],
      ): void {
        calls.push({ name, description, inputSchema, outputSchema, handler });
      },
    },
  };
}

function writeToolFile(dir: string, fileName: string, body: string): string {
  const filePath = join(dir, fileName);
  writeFileSync(filePath, body);
  return filePath;
}

describe("discoverTools", () => {
  it("registers provided tool descriptors without filesystem discovery", () => {
    const fake = makeFakeServer();
    const descriptor: ToolDescriptor = {
      name: "compiled_fixture",
      description: "compiled fixture",
      inputSchema: z.object({ value: z.string() }),
      handler: async () => ({ content: [{ type: "text", text: "ok" }] }),
    };

    const registered = registerToolDescriptors(fake.server, [descriptor]);

    expect(registered).toEqual([descriptor]);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.name).toBe("compiled_fixture");
    expect(fake.calls[0]?.description).toBe("compiled fixture");
    expect(fake.calls[0]?.handler).toBe(descriptor.handler);
  });

  it("discovers and registers a tool from a *.js file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wp-mcp-discover-"));
    writeToolFile(
      dir,
      "sample.js",
      [
        'const fakeShape = { _def: { typeName: "ZodObject", shape: () => ({}) }, parse: (x) => x }',
        "export default {",
        '  name: "fixture_tool",',
        '  description: "fixture description",',
        "  inputSchema: fakeShape,",
        '  handler: async () => ({ content: [{ type: "text", text: "ok" }] }),',
        "}",
      ].join("\n"),
    );

    const fake = makeFakeServer();
    await discoverTools(fake.server, dir);
    const names = fake.calls.map((c) => c.name);
    expect(names).toContain("fixture_tool");
    const sample = fake.calls.find((c) => c.name === "fixture_tool");
    expect(sample?.description).toBe("fixture description");
    // JSON Schema for an empty zod-like object is at minimum a non-null object.
    expect(typeof sample?.inputSchema).toBe("object");
  });

  it("skips *.test.* files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wp-mcp-discover-"));
    writeToolFile(
      dir,
      "good.js",
      [
        'const fakeShape = { _def: { typeName: "ZodObject", shape: () => ({}) }, parse: (x) => x }',
        "export default {",
        '  name: "good",',
        '  description: "good",',
        "  inputSchema: fakeShape,",
        '  handler: async () => ({ content: [{ type: "text", text: "ok" }] }),',
        "}",
      ].join("\n"),
    );
    writeToolFile(
      dir,
      "bad.test.js",
      [
        'const fakeShape = { _def: { typeName: "ZodObject", shape: () => ({}) }, parse: (x) => x }',
        "export default {",
        '  name: "bad",',
        '  description: "bad",',
        "  inputSchema: fakeShape,",
        '  handler: async () => ({ content: [{ type: "text", text: "bad" }] }),',
        "}",
      ].join("\n"),
    );
    const fake = makeFakeServer();
    await discoverTools(fake.server, dir);
    expect(fake.calls.map((c) => c.name)).toEqual(["good"]);
  });

  it("skips underscore-prefixed helper modules", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wp-mcp-discover-helper-"));
    writeToolFile(
      dir,
      "good.js",
      [
        'const fakeShape = { _def: { typeName: "ZodObject", shape: () => ({}) }, parse: (x) => x }',
        "export default {",
        '  name: "good",',
        '  description: "good",',
        "  inputSchema: fakeShape,",
        '  handler: async () => ({ content: [{ type: "text", text: "ok" }] }),',
        "}",
      ].join("\n"),
    );
    writeToolFile(dir, "_registry.js", "export const COMPILED_TOOL_REGISTRY = []\n");

    const fake = makeFakeServer();
    await discoverTools(fake.server, dir);
    expect(fake.calls.map((c) => c.name)).toEqual(["good"]);
  });

  it("passes through input via the registered handler", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wp-mcp-discover-"));
    writeToolFile(
      dir,
      "echo.js",
      [
        'const fakeShape = { _def: { typeName: "ZodObject", shape: () => ({}) }, parse: (x) => x }',
        "export default {",
        '  name: "echo",',
        '  description: "echo",',
        "  inputSchema: fakeShape,",
        '  handler: async (input) => ({ content: [{ type: "text", text: JSON.stringify(input) }] }),',
        "}",
      ].join("\n"),
    );
    const fake = makeFakeServer();
    await discoverTools(fake.server, dir);
    const call = fake.calls.find((c) => c.name === "echo");
    expect(call).toBeDefined();
    const result = await call!.handler({ hi: "there" });
    expect(result.content[0]).toMatchObject({ type: "text", text: '{"hi":"there"}' });
  });

  it("passes through `outputSchema` to the registrar when present", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wp-mcp-discover-output-schema-"));
    writeToolFile(
      dir,
      "typed.js",
      [
        'const fakeShape = { _def: { typeName: "ZodObject", shape: () => ({}) }, parse: (x) => x }',
        "export default {",
        '  name: "typed",',
        '  description: "typed",',
        "  inputSchema: fakeShape,",
        "  outputSchema: fakeShape,",
        "  handler: async () => ({",
        '    content: [{ type: "text", text: "{\\"ok\\":true}" }],',
        "    structuredContent: { ok: true },",
        "  }),",
        "}",
      ].join("\n"),
    );

    const fake = makeFakeServer();
    await discoverTools(fake.server, dir);
    const typed = fake.calls.find((c) => c.name === "typed");
    expect(typed?.outputSchema).toEqual({ type: "object", bareShape: true });
    const result = await typed!.handler({});
    expect(result.structuredContent).toEqual({ ok: true });
  });

  it("keeps the descriptor type permissive enough for real zod schemas", () => {
    // Compile-time / runtime sanity: ensure ToolDescriptor allows a real z.object schema.
    const descriptor: ToolDescriptor = {
      name: "x",
      description: "y",
      inputSchema: z.object({ a: z.string() }),
      handler: async () => ({ content: [] }),
    };
    expect(descriptor.name).toBe("x");
  });

  // Regression: tools that declare `annotations` (readOnlyHint, idempotentHint,
  // openWorldHint) must have those values flow through the registrar so the
  // server can include them in tools/list. Without this, MCP clients
  // pessimize and gate every read-only call behind a confirmation prompt.
  it("passes through `annotations` to the registrar", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wp-mcp-discover-annotations-"));
    writeToolFile(
      dir,
      "annotated.js",
      [
        'const fakeShape = { _def: { typeName: "ZodObject", shape: () => ({}) }, parse: (x) => x }',
        "export default {",
        '  name: "annotated",',
        '  description: "annotated",',
        "  inputSchema: fakeShape,",
        "  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },",
        '  handler: async () => ({ content: [{ type: "text", text: "ok" }] }),',
        "}",
      ].join("\n"),
    );

    const calls: Array<{
      name: string;
      annotations?: Record<string, unknown>;
    }> = [];
    const fakeServer = {
      registerTool(
        name: string,
        _description: string,
        _schema: Record<string, unknown>,
        _outputSchema: Record<string, unknown> | undefined,
        _handler: ToolDescriptor["handler"],
        annotations?: Record<string, unknown>,
      ): void {
        calls.push({ name, annotations });
      },
    };
    await discoverTools(fakeServer, dir);
    const annotated = calls.find((c) => c.name === "annotated");
    expect(annotated?.annotations).toEqual({
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    });
  });

  it("omits `annotations` when the descriptor has none", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wp-mcp-discover-noann-"));
    writeToolFile(
      dir,
      "plain.js",
      [
        'const fakeShape = { _def: { typeName: "ZodObject", shape: () => ({}) }, parse: (x) => x }',
        "export default {",
        '  name: "plain",',
        '  description: "plain",',
        "  inputSchema: fakeShape,",
        '  handler: async () => ({ content: [{ type: "text", text: "ok" }] }),',
        "}",
      ].join("\n"),
    );
    const calls: Array<{ name: string; annotations?: Record<string, unknown> }> = [];
    const fakeServer = {
      registerTool(
        name: string,
        _description: string,
        _schema: Record<string, unknown>,
        _outputSchema: Record<string, unknown> | undefined,
        _handler: ToolDescriptor["handler"],
        annotations?: Record<string, unknown>,
      ): void {
        calls.push({ name, annotations });
      },
    };
    await discoverTools(fakeServer, dir);
    const plain = calls.find((c) => c.name === "plain");
    expect(plain?.annotations).toBeUndefined();
  });
});
