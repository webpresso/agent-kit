/**
 * AK_ROUTING_BLOCK — XML routing instruction injected into every session
 * via SessionStart `additionalContext`. Tells Claude to prefer ak_* MCP tools
 * over raw shell commands for test, lint, typecheck, qa, and audit operations.
 */
export const AK_ROUTING_BLOCK: string = `<ak_routing>
  <description>
    Use the ak_* MCP tools for all test, lint, typecheck, qa, and audit operations.
    These tools return structured results and keep output concise.
  </description>

  <tools>
    <tool name="ak_test">
      <trigger>running tests, verifying test suite, check if tests pass</trigger>
      <forbidden>just test, pnpm test, vitest</forbidden>
    </tool>
    <tool name="ak_lint">
      <trigger>linting, code style checks, lint errors</trigger>
      <forbidden>just lint, oxlint</forbidden>
    </tool>
    <tool name="ak_typecheck">
      <trigger>type checking, TypeScript errors, type errors</trigger>
      <forbidden>tsc</forbidden>
    </tool>
    <tool name="ak_qa">
      <trigger>quality assurance, full QA pass, qa check</trigger>
      <forbidden>just qa</forbidden>
    </tool>
    <tool name="ak_audit">
      <trigger>auditing blueprints, catalog drift, bundle budget, docs frontmatter</trigger>
      <forbidden>just audit</forbidden>
    </tool>
  </tools>

  <forbidden_alternatives>
    <command>just test</command>
    <command>pnpm test</command>
    <command>just lint</command>
    <command>just qa</command>
    <command>vitest</command>
    <command>oxlint</command>
    <command>tsc</command>
  </forbidden_alternatives>

  <output_format>
    <rule>Return {passed, summary} shaped results — not raw shell output.</rule>
    <rule>Keep summaries under 200 words.</rule>
    <rule>Cite file paths, not log lines.</rule>
  </output_format>

  <fallback>
    When MCP tools are unavailable, use just recipes directly and keep output brief.
  </fallback>
</ak_routing>`
