/**
 * AK_ROUTING_BLOCK — XML routing instruction injected into every session
 * via SessionStart `additionalContext`. Tells Claude to prefer ak_* MCP tools
 * over raw shell commands for dev-workflow operations. Context-mode owns ctx_*
 * nudging when that plugin is installed.
 */
export const AK_ROUTING_BLOCK = `<ak_routing>
  <description>
    Use the ak_* MCP tools for all test, lint, typecheck, qa, and audit operations.
    If context-mode plugin routing is present, let it own ctx_* data-processing nudges.
    These tools return structured, summary-first results and keep output concise.
  </description>

  <decision_table>
    <row>
      <trigger>running tests, verifying test suite, check if tests pass</trigger>
      <tool>ak_test</tool>
    </row>
    <row>
      <trigger>running e2e test files or package-scoped e2e execution</trigger>
      <tool>ak_e2e</tool>
    </row>
    <row>
      <trigger>linting, code style checks, lint errors</trigger>
      <tool>ak_lint</tool>
    </row>
    <row>
      <trigger>type checking, TypeScript errors, type errors</trigger>
      <tool>ak_typecheck</tool>
    </row>
    <row>
      <trigger>quality assurance, full QA pass, qa check</trigger>
      <tool>ak_qa</tool>
    </row>
    <row>
      <trigger>auditing blueprints, catalog drift, bundle budget, docs frontmatter</trigger>
      <tool>ak_audit</tool>
    </row>
    <row>
      <trigger>e2e testing philosophy audit, tph-e2e</trigger>
      <tool>ak_audit(kind="tph-e2e")</tool>
    </row>
  </decision_table>

  <tools>
    <tool name="ak_test">
      <category>dev-workflow</category>
      <trigger>running tests, verifying test suite, check if tests pass</trigger>
      <forbidden>just test, pnpm test, vitest</forbidden>
    </tool>
    <tool name="ak_e2e">
      <category>dev-workflow</category>
      <trigger>running e2e test files, suite-aware e2e execution, host-adapter e2e flows</trigger>
      <usage>Use for E2E execution. Supports suite-aware and host-adapter-backed planning.</usage>
    </tool>
    <tool name="ak_lint">
      <category>dev-workflow</category>
      <trigger>linting, code style checks, lint errors</trigger>
      <forbidden>just lint, oxlint</forbidden>
    </tool>
    <tool name="ak_typecheck">
      <category>dev-workflow</category>
      <trigger>type checking, TypeScript errors, type errors</trigger>
      <forbidden>tsc</forbidden>
    </tool>
    <tool name="ak_qa">
      <category>dev-workflow</category>
      <trigger>quality assurance, full QA pass, qa check</trigger>
      <forbidden>just qa</forbidden>
    </tool>
    <tool name="ak_audit">
      <category>dev-workflow</category>
      <trigger>auditing blueprints, catalog drift, bundle budget, docs frontmatter</trigger>
      <forbidden>just audit</forbidden>
      <usage>Use kind="tph-e2e" for the E2E testing-philosophy audit. This audits E2E quality rules; it does not execute the E2E suite itself.</usage>
    </tool>
  </tools>

  <ownership_boundary>
    <rule>Agent-kit owns ak_* dev-workflow routing here.</rule>
    <rule>Context-mode owns ctx_* routing when that plugin is installed.</rule>
  </ownership_boundary>

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
    <rule>Return structured, summary-first results — not raw shell output.</rule>
    <rule>Keep summaries under 200 words.</rule>
    <rule>Cite file paths, not log lines; raw output is clipped and secondary.</rule>
    <rule>Keep the style short, direct, and context-friendly.</rule>
  </output_format>

  <fallback>
    When MCP tools are unavailable, use just recipes directly and keep output brief.
    .omx is runtime/state only; it is not a direct hook surface.
  </fallback>
</ak_routing>`;
//# sourceMappingURL=routing-block.js.map