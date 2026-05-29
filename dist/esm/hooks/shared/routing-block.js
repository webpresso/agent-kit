/**
 * WP_ROUTING_BLOCK — XML routing instruction injected into every session
 * via SessionStart `additionalContext`. Tells Claude to prefer wp_* MCP tools
 * over raw shell commands for dev-workflow operations. Context-mode owns ctx_*
 * nudging when that plugin is installed.
 */
export const WP_ROUTING_BLOCK = `<wp_routing>
  <description>
    Use the wp_* MCP tools for all test, lint, typecheck, qa, audit, local CI act,
    and Cloudflare Worker tail operations.
    If context-mode plugin routing is present, let it own ctx_* data-processing nudges.
    These tools return structured, summary-first results and keep output concise.
  </description>

  <decision_table>
    <row>
      <trigger>running tests, verifying test suite, check if tests pass</trigger>
      <tool>wp_test</tool>
    </row>
    <row>
      <trigger>running e2e test files or package-scoped e2e execution</trigger>
      <tool>wp_e2e</tool>
    </row>
    <row>
      <trigger>linting, code style checks, lint errors</trigger>
      <tool>wp_lint</tool>
    </row>
    <row>
      <trigger>type checking, TypeScript errors, type errors</trigger>
      <tool>wp_typecheck</tool>
    </row>
    <row>
      <trigger>quality assurance, full QA pass, qa check, markdown lint, lint-md, markdownlint</trigger>
      <tool>wp_qa</tool>
    </row>
    <row>
      <trigger>auditing blueprints, catalog drift, bundle budget, docs frontmatter</trigger>
      <tool>wp_audit</tool>
    </row>
    <row>
      <trigger>running act, local GitHub Actions, with-secrets -- act, vp exec act, pnpm exec act</trigger>
      <tool>wp_ci_act</tool>
    </row>
    <row>
      <trigger>wrangler tail, with-secrets -- wrangler tail, Cloudflare Worker logs</trigger>
      <tool>wp_worker_tail</tool>
    </row>
    <row>
      <trigger>e2e testing philosophy audit, tph-e2e</trigger>
      <tool>wp_audit(kind="tph-e2e")</tool>
    </row>
  </decision_table>

  <tools>
    <tool name="wp_test">
      <category>dev-workflow</category>
      <trigger>running tests, verifying test suite, check if tests pass</trigger>
      <forbidden>just test, pnpm test, vitest</forbidden>
    </tool>
    <tool name="wp_e2e">
      <category>dev-workflow</category>
      <trigger>running e2e test files, suite-aware e2e execution, host-adapter e2e flows</trigger>
      <usage>Use for E2E execution. Supports suite-aware and host-adapter-backed planning.</usage>
    </tool>
    <tool name="wp_lint">
      <category>dev-workflow</category>
      <trigger>linting, code style checks, lint errors</trigger>
      <forbidden>just lint, oxlint</forbidden>
    </tool>
    <tool name="wp_typecheck">
      <category>dev-workflow</category>
      <trigger>type checking, TypeScript errors, type errors</trigger>
      <forbidden>tsc</forbidden>
    </tool>
    <tool name="wp_qa">
      <category>dev-workflow</category>
      <trigger>quality assurance, full QA pass, qa check, markdown lint, lint-md, markdownlint</trigger>
      <forbidden>just qa, just lint-md, markdownlint-cli2</forbidden>
    </tool>
    <tool name="wp_audit">
      <category>dev-workflow</category>
      <trigger>auditing blueprints, catalog drift, bundle budget, docs frontmatter</trigger>
      <forbidden>just audit</forbidden>
      <usage>Use kind="tph-e2e" for the E2E testing-philosophy audit. This audits E2E quality rules; it does not execute the E2E suite itself.</usage>
    </tool>
    <tool name="wp_ci_act">
      <category>dev-workflow</category>
      <trigger>running act, local GitHub Actions, with-secrets -- act, vp exec act, pnpm exec act</trigger>
      <forbidden>act, vp exec act, pnpm exec act</forbidden>
      <usage>Use the wp_ci_act MCP tool for local GitHub Actions execution. The tool uses the public secret contract: configure with wp config secrets ... and execute through with-secrets -- act ... internally.</usage>
    </tool>
    <tool name="wp_worker_tail">
      <category>dev-workflow</category>
      <trigger>wrangler tail, with-secrets -- wrangler tail, Cloudflare Worker logs</trigger>
      <forbidden>wrangler tail, with-secrets -- wrangler tail</forbidden>
      <usage>Use the wp_worker_tail MCP tool for Cloudflare Worker tail logs. The tool routes through the canonical with-secrets -- wrangler tail ... contract and returns bounded redacted output.</usage>
    </tool>
  </tools>

  <ownership_boundary>
    <rule>Agent-kit owns wp_* dev-workflow routing here.</rule>
    <rule>Context-mode owns ctx_* routing when that plugin is installed.</rule>
  </ownership_boundary>

  <package_guidance>
    <rule>Consumers add @webpresso/agent-kit and import config helpers through @webpresso/agent-kit/* subpath exports such as @webpresso/agent-kit/oxlint, @webpresso/agent-kit/vitest/node, @webpresso/agent-kit/test-preset, @webpresso/agent-kit/e2e-preset, @webpresso/agent-kit/tsconfig/base.json, @webpresso/agent-kit/docs-lint, @webpresso/agent-kit/stryker, @webpresso/agent-kit/launch, and @webpresso/agent-kit/workers-test.</rule>
    <rule>Do not recommend adding retired split agent config packages for consumer projects; keep wp_* MCP tool names and wp-* hook bin names unchanged.</rule>
  </package_guidance>

  <forbidden_alternatives>
    <command>just test</command>
    <command>pnpm test</command>
    <command>just lint</command>
    <command>just qa</command>
    <command>just lint-md</command>
    <command>vitest</command>
    <command>oxlint</command>
    <command>markdownlint-cli2</command>
    <command>tsc</command>
    <command>act</command>
    <command>vp exec act</command>
    <command>pnpm exec act</command>
    <command>wrangler tail</command>
    <command>with-secrets -- act</command>
    <command>with-secrets -- wrangler tail</command>
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
</wp_routing>`;
//# sourceMappingURL=routing-block.js.map