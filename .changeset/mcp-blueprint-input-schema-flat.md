---
"@webpresso/agent-kit": patch
---

Fix `ak_blueprint` MCP tool: flatten `inputSchema` so it serializes with root-level `type: "object"`.

The MCP spec (`ToolSchema` in `@modelcontextprotocol/sdk`) requires every tool's `inputSchema.type` to be exactly `"object"`. `ak_blueprint` previously declared its input schema as a Zod `discriminatedUnion`, which serializes to JSON Schema as `{ oneOf: [...] }` with no top-level `type`. Strict MCP clients (e.g. Codex) rejected the entire `tools/list` response with:

```
"path": ["tools", N, "inputSchema", "type"], "message": "expected 'object'"
```

That broke ALL agent-kit MCP tools for the offending client, not just `ak_blueprint`.

The fix flattens the schema to a single `z.object({ action, ...optional fields })` and enforces the per-action invariants (`goal` required when `action === 'new'`) via `superRefine`. JSON-schema clients now see one valid object shape; runtime dispatch is unchanged.

All 8 MCP tools (`ak_lint`, `ak_qa`, `ak_e2e`, `ak_test`, `ak_format`, `ak_blueprint`, `ak_typecheck`, `ak_audit`) now serialize with spec-compliant root shape.
