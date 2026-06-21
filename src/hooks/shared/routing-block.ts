/**
 * WP_ROUTING_BLOCK — XML routing instruction injected into every session
 * via SessionStart `additionalContext`. Tells Claude to prefer wp_* MCP tools
 * over raw shell commands for dev-workflow operations.
 */
export const WP_ROUTING_BLOCK: string = `<wp_routing>
  <description>
    Use the wp_* MCP tools for all test, lint, typecheck, qa, audit, local CI act,
    Cloudflare Worker tail, PR/CI status, benchmarks, gain reports, release readiness,
    and session-memory context-window protection operations.
    If a wp_* MCP tool is stale or unavailable, use the matching direct wp CLI command.
    Never invoke wp through package-manager wrappers such as bun run wp, pnpm run wp,
    npm run wp, yarn wp, or vp run wp.
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
      <trigger>single audit: auditing blueprints, catalog drift, bundle budget, docs frontmatter</trigger>
      <tool>wp_audit</tool>
    </row>
    <row>
      <trigger>running act, local GitHub Actions, legacy with-secrets -- act, vp exec act, pnpm exec act</trigger>
      <tool>wp_ci_act</tool>
    </row>
    <row>
      <trigger>wrangler tail, legacy with-secrets -- wrangler tail, Cloudflare Worker logs</trigger>
      <tool>wp_worker_tail</tool>
    </row>
    <row>
      <trigger>PR status, GitHub checks, gh pr view, gh pr checks, review decision</trigger>
      <tool>wp_pr_status</tool>
    </row>
    <row>
      <trigger>session-memory benchmark, wp bench session-memory, benchmark dry-run</trigger>
      <tool>wp_bench</tool>
    </row>
    <row>
      <trigger>gain reporting, wp gain, rtk gain, token savings report</trigger>
      <tool>wp_gain</tool>
    </row>
    <row>
      <trigger>release readiness, package surface, changeset status, public readiness, reference parity</trigger>
      <tool>wp_release_readiness</tool>
    </row>
    <row>
      <trigger>e2e testing philosophy audit, tph-e2e</trigger>
      <tool>wp_audit(kind="tph-e2e")</tool>
    </row>
    <row>
      <trigger>package-manager wrappers around wp such as bun run wp, pnpm run wp, npm run wp, yarn wp, vp run wp</trigger>
      <tool>Use the matching wp_* MCP tool first; otherwise run direct wp</tool>
    </row>
  </decision_table>


  <wp_session_context>
    <description>
      Context-window protection is mandatory for large-context work. Use wp_session_* MCP tools before raw reads, searches, shell output, network fetches, or compaction-sensitive continuity events can flood the transcript. Use restore/search first when resuming or recalling prior work.
    </description>
    <hierarchy>
      <rule>retrieve exact elisions first when a handle is present: use wp_session_retrieve for elided or truncated content ids.</rule>
      <rule>restore/search first: use wp_session_restore for bounded continuity restore and wp_session_search for indexed chunks or event recall when no exact elision handle is available.</rule>
      <rule>read-to-analyze: use wp_session_execute_file for local file metadata or bounded read_text previews instead of raw full-file dumps.</rule>
      <rule>shell gathering: use wp_session_batch_execute for planned multi-command evidence gathering, or wp_session_execute for one explicit bounded command.</rule>
      <rule>network fetches: use wp_session_fetch_and_index for absolute http(s) fetches so SSRF checks, byte caps, indexing, and warnings apply.</rule>
      <rule>manual continuity: use wp_session_capture for decisions/constraints and wp_session_snapshot before risky operations, branch switches, or compaction.</rule>
      <rule>diagnostics: use wp_session_stats and wp_session_doctor before changing storage behavior.</rule>
      <rule>reset: use wp_session_purge only for an explicit reset; dry-run first and require confirmation for deletion.</rule>
    </hierarchy>
    <tools>
      <tool name="wp_session_restore"><category>session-memory</category><trigger>resume, restore, recover context, compacted session continuity</trigger></tool>
      <tool name="wp_session_search"><category>session-memory</category><trigger>search prior indexed evidence, recall decisions, find session references</trigger></tool>
      <tool name="wp_session_retrieve"><category>session-memory</category><trigger>retrieve exact elided or truncated content by handle id</trigger></tool>
      <tool name="wp_session_execute_file"><category>session-memory</category><trigger>read-to-analyze, inspect large files, local file metadata, bounded file preview</trigger></tool>
      <tool name="wp_session_execute"><category>session-memory</category><trigger>single bounded shell command whose output may be large or useful later</trigger></tool>
      <tool name="wp_session_batch_execute"><category>session-memory</category><trigger>shell gathering, multiple bounded evidence commands, grep/find/git log batches</trigger></tool>
      <tool name="wp_session_fetch_and_index"><category>session-memory</category><trigger>network fetches, WebFetch-like evidence, curl/wget replacement</trigger></tool>
      <tool name="wp_session_index"><category>session-memory</category><trigger>index caller-provided chunks or externally summarized evidence</trigger></tool>
      <tool name="wp_session_capture"><category>session-memory</category><trigger>manual continuity capture for decisions, constraints, task state, or rejected approaches</trigger></tool>
      <tool name="wp_session_snapshot"><category>session-memory</category><trigger>snapshot before compaction, risky changes, branch switch, or handoff</trigger></tool>
      <tool name="wp_session_stats"><category>session-memory</category><trigger>read-only local session-memory counts and source diagnostics</trigger></tool>
      <tool name="wp_session_doctor"><category>session-memory</category><trigger>diagnose local session-memory stores, locks, corruption, and repair hints</trigger></tool>
      <tool name="wp_session_purge"><category>session-memory</category><trigger>explicit dry-run reset or confirmed scoped deletion</trigger></tool>
    </tools>
    <safety>
      <rule>Never store raw full payloads or secrets; prefer bounded previews, provenance ids, warnings, and indexed references.</rule>
      <rule>If the Webpresso MCP surface is not loaded, load it or use the direct wp session command where available; do not default to raw large output.</rule>
    </safety>
  </wp_session_context>


  <tools>
    <tool name="wp_test">
      <category>dev-workflow</category>
      <trigger>running tests, verifying test suite, check if tests pass</trigger>
      <forbidden>just test, bun run test, pnpm test, vitest, npx vitest, npm exec -- vitest, yarn vitest, bunx vitest, node ./node_modules/vitest/vitest.mjs</forbidden>
    </tool>
    <tool name="wp_e2e">
      <category>dev-workflow</category>
      <trigger>running e2e test files, suite-aware e2e execution, host-adapter e2e flows</trigger>
      <usage>Use for E2E execution. Supports suite-aware and host-adapter-backed planning.</usage>
    </tool>
    <tool name="wp_lint">
      <category>dev-workflow</category>
      <trigger>linting, code style checks, lint errors</trigger>
      <forbidden>just lint, bun run lint, oxlint, node ./node_modules/oxlint/bin/oxlint</forbidden>
    </tool>
    <tool name="wp_typecheck">
      <category>dev-workflow</category>
      <trigger>type checking, TypeScript errors, type errors</trigger>
      <forbidden>bun run typecheck, tsc, node ./node_modules/typescript/bin/tsc</forbidden>
    </tool>
    <tool name="wp_qa">
      <category>dev-workflow</category>
      <trigger>quality assurance, full QA pass, qa check, markdown lint, lint-md, markdownlint</trigger>
      <forbidden>bun run lint-md, bun run qa, just qa, just lint-md, markdownlint-cli2</forbidden>
    </tool>
    <tool name="wp_audit">
      <category>dev-workflow</category>
      <trigger>auditing blueprints, catalog drift, bundle budget, docs frontmatter</trigger>
      <forbidden>just audit</forbidden>
      <usage>Use kind="tph-e2e" for the E2E testing-philosophy audit. This audits E2E quality rules; it does not execute the E2E suite itself.</usage>
    </tool>
    <tool name="wp_ci_act">
      <category>dev-workflow</category>
      <trigger>running act, local GitHub Actions, legacy with-secrets -- act, vp exec act, pnpm exec act</trigger>
      <forbidden>act, vp exec act, pnpm exec act</forbidden>
      <usage>Use the wp_ci_act MCP tool for local GitHub Actions execution. The tool uses the public secret contract: configure with wp config secrets ... and execute through wp secrets run --sink act --profile <profile> -- act ... internally.</usage>
    </tool>
    <tool name="wp_worker_tail">
      <category>dev-workflow</category>
      <trigger>wrangler tail, legacy with-secrets -- wrangler tail, Cloudflare Worker logs</trigger>
      <forbidden>wrangler tail, with-secrets -- wrangler tail</forbidden>
      <usage>Use the wp_worker_tail MCP tool for Cloudflare Worker tail logs. The tool routes through wp secrets run --sink deploy-wrangler --profile <profile> -- wrangler tail ... and returns bounded redacted output.</usage>
    </tool>
    <tool name="wp_pr_status">
      <category>dev-workflow</category>
      <trigger>PR status, GitHub checks, gh pr view, gh pr checks, review decision</trigger>
      <forbidden>gh pr view, gh pr checks</forbidden>
      <usage>Use wp_pr_status for read-only PR/check/review summaries. It does not mutate PRs.</usage>
    </tool>
    <tool name="wp_bench">
      <category>dev-workflow</category>
      <trigger>session-memory benchmark, wp bench session-memory, benchmark dry-run</trigger>
      <usage>Use wp_bench for structured benchmark evidence. It defaults to dry-run unless live mode is explicit.</usage>
    </tool>
    <tool name="wp_gain">
      <category>dev-workflow</category>
      <trigger>gain reporting, wp gain, rtk gain, token savings report</trigger>
      <forbidden>rtk gain</forbidden>
      <usage>Use wp_gain for bounded session-memory or RTK gain totals.</usage>
    </tool>
    <tool name="wp_release_readiness">
      <category>dev-workflow</category>
      <trigger>release readiness, package surface, changeset status, public readiness, reference parity</trigger>
      <usage>Use wp_release_readiness for read-only release gates; it must not publish, tag, version, merge, or mutate release state.</usage>
    </tool>
  </tools>

  <ownership_boundary>
    <rule>Agent-kit owns wp_* dev-workflow routing here.</rule>
  </ownership_boundary>

  <hook_diagnostics>
    <rule>Prefer wp hook &lt;name&gt; over direct wp-&lt;hook-bin&gt; calls when a wp hook command exists.</rule>
    <rule>Direct wp-* hook bins remain generated-hook runtime internals, not recommended agent diagnostics.</rule>
    <rule>Direct wp is the only public CLI fallback; do not wrap it in package-manager scripts.</rule>
  </hook_diagnostics>

  <package_guidance>
    <rule>Consumers add @webpresso/agent-kit for CLI/audit/tooling helpers such as @webpresso/agent-kit/oxlint, @webpresso/agent-kit/test-preset, @webpresso/agent-kit/e2e-preset, @webpresso/agent-kit/docs-lint, and @webpresso/agent-kit/launch; and add @webpresso/agent-config for config presets such as @webpresso/agent-config/tsconfig/base.json, @webpresso/agent-config/vitest/node, @webpresso/agent-config/stryker, and @webpresso/agent-config/workers-test.</rule>
    <rule>Do not recommend adding retired split agent config packages for consumer projects; keep wp_* MCP tool names and wp-* hook bin names unchanged.</rule>
  </package_guidance>

  <forbidden_alternatives>
    <command>just test</command>
    <command>bun run test</command>
    <command>pnpm test</command>
    <command>bun run wp</command>
    <command>pnpm run wp</command>
    <command>npm run wp</command>
    <command>yarn wp</command>
    <command>vp run wp</command>
    <command>just lint</command>
    <command>bun run lint</command>
    <command>just qa</command>
    <command>bun run qa</command>
    <command>bun run lint-md</command>
    <command>just lint-md</command>
    <command>vitest</command>
    <command>npx vitest</command>
    <command>npm exec -- vitest</command>
    <command>yarn vitest</command>
    <command>bunx vitest</command>
    <command>node ./node_modules/vitest/vitest.mjs</command>
    <command>oxlint</command>
    <command>node ./node_modules/oxlint/bin/oxlint</command>
    <command>bun run e2e</command>
    <command>markdownlint-cli2</command>
    <command>tsc</command>
    <command>bun run typecheck</command>
    <command>node ./node_modules/typescript/bin/tsc</command>
    <command>act</command>
    <command>vp exec act</command>
    <command>pnpm exec act</command>
    <command>wrangler tail</command>
    <command>with-secrets -- act</command>
    <command>with-secrets -- wrangler tail</command>
    <command>gh pr view</command>
    <command>gh pr checks</command>
    <command>rtk gain</command>
  </forbidden_alternatives>

  <output_format>
    <rule>Return structured, summary-first results — not raw shell output.</rule>
    <rule>Keep summaries under 200 words.</rule>
    <rule>Cite file paths, not log lines; raw output is clipped and secondary.</rule>
    <rule>Keep the style short, direct, and context-friendly.</rule>
  </output_format>

  <fallback>
    When MCP tools are unavailable or stale, use the matching wp CLI command and keep output brief.
    Do not fall through to raw tool bins under node_modules when a wp wrapper exists.
    .omx is runtime/state only; it is not a direct hook surface.
  </fallback>
</wp_routing>`

export type RoutingInstructionSource = {
  readonly name: 'wp_routing'
  readonly content: string
}

export function createRoutingInstructionSource(): RoutingInstructionSource {
  return { name: 'wp_routing', content: WP_ROUTING_BLOCK }
}
