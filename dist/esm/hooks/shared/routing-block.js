/**
 * AK_ROUTING_BLOCK — XML routing instruction injected into every session
 * via SessionStart `additionalContext`. Tells Claude to prefer ak_* MCP tools
 * over raw shell commands for dev-workflow operations, and ctx_* sandbox tools
 * for data-heavy processing work.
 */
export const AK_ROUTING_BLOCK = `<ak_routing>
  <description>
    Use the ak_* MCP tools for all test, lint, typecheck, qa, and audit operations.
    Use the ctx_* sandbox tools for data-heavy processing, log analysis, and web research.
    These tools return structured results and keep output concise.
  </description>

  <decision_table>
    <row>
      <trigger>running tests, verifying test suite, check if tests pass</trigger>
      <tool>ak_test</tool>
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
      <trigger>data-heavy shell commands, log processing, computation</trigger>
      <tool>ctx_execute</tool>
    </row>
    <row>
      <trigger>searching previously indexed content, querying knowledge base</trigger>
      <tool>ctx_search</tool>
    </row>
    <row>
      <trigger>fetching web pages, indexing remote documentation</trigger>
      <tool>ctx_fetch_and_index</tool>
    </row>
    <row>
      <trigger>combined research: multiple commands plus search in one call</trigger>
      <tool>ctx_batch_execute</tool>
    </row>
  </decision_table>

  <tools>
    <tool name="ak_test">
      <category>dev-workflow</category>
      <trigger>running tests, verifying test suite, check if tests pass</trigger>
      <forbidden>just test, pnpm test, vitest</forbidden>
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
    </tool>
    <tool name="ctx_execute">
      <category>data-processing</category>
      <trigger>data-heavy shell commands producing more than 20 lines, log analysis, computation</trigger>
    </tool>
    <tool name="ctx_search">
      <category>data-processing</category>
      <trigger>searching indexed content, querying previously indexed sources</trigger>
    </tool>
    <tool name="ctx_fetch_and_index">
      <category>data-processing</category>
      <trigger>fetching web pages, indexing remote documentation or URLs</trigger>
    </tool>
    <tool name="ctx_batch_execute">
      <category>data-processing</category>
      <trigger>combined research: run multiple shell commands and search in one call</trigger>
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
    <rule>Follow context-mode caveman output style: short, direct, no fluff.</rule>
  </output_format>

  <fallback>
    When MCP tools are unavailable, use just recipes directly and keep output brief.
  </fallback>
</ak_routing>`;
//# sourceMappingURL=routing-block.js.map