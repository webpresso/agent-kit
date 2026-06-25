import { describe, expect, it } from "vitest";

import {
  agentFrontmatterSchema,
  commandFrontmatterSchema,
  skillFrontmatterSchema,
} from "./schema.js";

describe("skillFrontmatterSchema", () => {
  it("accepts minimal required fields", () => {
    const result = skillFrontmatterSchema.safeParse({
      name: "my-skill",
      description: "Does something useful",
    });
    expect(result.success).toBe(true);
  });

  it("accepts all optional fields", () => {
    const result = skillFrontmatterSchema.safeParse({
      name: "my-skill",
      description: "Does something useful",
      when_to_use: "When you need X",
      "argument-hint": "<arg>",
      arguments: [{ name: "target", description: "The target", required: true }],
      "disable-model-invocation": false,
      "user-invocable": true,
      "allowed-tools": ["Bash", "Read"],
    });
    expect(result.success).toBe(true);
  });

  it("fails when name is missing", () => {
    const result = skillFrontmatterSchema.safeParse({
      description: "No name here",
    });
    expect(result.success).toBe(false);
  });

  it("fails when description is missing", () => {
    const result = skillFrontmatterSchema.safeParse({
      name: "my-skill",
    });
    expect(result.success).toBe(false);
  });

  it("passthrough allows extra unknown fields", () => {
    const result = skillFrontmatterSchema.safeParse({
      name: "my-skill",
      description: "Desc",
      extra_field: "extra_value",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).extra_field).toBe("extra_value");
    }
  });

  it("validates argument items shape", () => {
    const result = skillFrontmatterSchema.safeParse({
      name: "my-skill",
      description: "Desc",
      arguments: [{ name: "x", description: "y" }],
    });
    expect(result.success).toBe(true);
  });

  it("fails when argument item is malformed", () => {
    const result = skillFrontmatterSchema.safeParse({
      name: "my-skill",
      description: "Desc",
      arguments: [{ description: "missing name field" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("commandFrontmatterSchema", () => {
  it("accepts minimal required field", () => {
    const result = commandFrontmatterSchema.safeParse({
      description: "Run the build",
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional agent and model", () => {
    const result = commandFrontmatterSchema.safeParse({
      description: "Run the build",
      agent: "claude-code",
      model: "claude-sonnet-4-5",
    });
    expect(result.success).toBe(true);
  });

  it("fails when description is missing", () => {
    const result = commandFrontmatterSchema.safeParse({
      agent: "claude-code",
    });
    expect(result.success).toBe(false);
  });

  it("passthrough allows extra unknown fields", () => {
    const result = commandFrontmatterSchema.safeParse({
      description: "Run",
      custom: "value",
    });
    expect(result.success).toBe(true);
  });
});

describe("agentFrontmatterSchema", () => {
  it("accepts minimal required fields", () => {
    const result = agentFrontmatterSchema.safeParse({
      name: "my-agent",
      description: "An agent",
    });
    expect(result.success).toBe(true);
  });

  it("accepts all optional fields", () => {
    const result = agentFrontmatterSchema.safeParse({
      name: "my-agent",
      description: "An agent",
      tools: ["Bash"],
      disallowedTools: [],
      model: "claude-opus-4-5",
      permissionMode: "restricted",
      skills: ["debug"],
      mcpServers: { context7: { command: "npx" } },
      hooks: { PreToolUse: [] },
      maxTurns: 10,
      isolation: "worktree",
      color: "blue",
    });
    expect(result.success).toBe(true);
  });

  it("fails when name is missing", () => {
    const result = agentFrontmatterSchema.safeParse({
      description: "No name",
    });
    expect(result.success).toBe(false);
  });

  it("fails when description is missing", () => {
    const result = agentFrontmatterSchema.safeParse({
      name: "my-agent",
    });
    expect(result.success).toBe(false);
  });

  it("fails for invalid isolation value", () => {
    const result = agentFrontmatterSchema.safeParse({
      name: "my-agent",
      description: "Desc",
      isolation: "sandbox",
    });
    expect(result.success).toBe(false);
  });

  it("passthrough allows extra unknown fields", () => {
    const result = agentFrontmatterSchema.safeParse({
      name: "my-agent",
      description: "Desc",
      unknownProp: "something",
    });
    expect(result.success).toBe(true);
  });
});
