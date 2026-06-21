/**
 * `wp_audit` MCP tool.
 *
 * Wraps the existing `wp audit *` subcommands behind one MCP tool with a
 * `kind` enum. Returns a structured `{passed, kind, details}` payload wrapped
 * in MCP `text` content blocks.
 *
 * All kinds dispatch directly to the library functions exported from
 * `#audit/repo-guardrails`, `#audit/tech-debt`, `#audit/audit-tph-runner`,
 * `#audit/audit-tph-e2e-runner`, and `../../vite/local`.
 *
 * Audit failures (whether represented as `ok: false` from the library or
 * as a thrown error) are caught and returned as `{passed: false, ...}`
 * — the handler never throws out, so the MCP server stays responsive.
 */

import { z } from 'zod'

import type { ToolDescriptor } from '#mcp/auto-discover'
import { MCP_AUDIT_KINDS } from './_shared/audit-kinds.js'
import { createSummaryOutputSchema, createSummaryResult } from './_shared/result.js'

export const KINDS = MCP_AUDIT_KINDS

export const inputSchema = z.object({
  kind: z.enum(KINDS),
  /** Working tree to run the audit against. `directory` is accepted as an input alias. */
  cwd: z.string().optional(),
  directory: z.string().optional(),
  messageFile: z.string().optional(),
  baseRef: z.string().optional(),
  strict: z.boolean().optional(),
})

export type AkAuditInput = z.infer<typeof inputSchema>

export interface RepoAuditLikeResult {
  ok: boolean
  title?: string
  checked?: number
  violations?: { message: string; file?: string }[]
}

export type AuditPayload = {
  passed: boolean
  summary: string
  kind: string
  details: string | RepoAuditLikeResult | { exitCode: number }
  rawOutput?: string
  truncated?: true
  logPath?: string
}

const repoAuditSchema = z.object({
  ok: z.boolean(),
  title: z.string().optional(),
  checked: z.number().optional(),
  violations: z
    .array(
      z.object({
        message: z.string(),
        file: z.string().optional(),
      }),
    )
    .optional(),
})

const outputSchema = createSummaryOutputSchema({
  details: z.union([repoAuditSchema, z.object({ exitCode: z.number() }), z.string()]),
}).extend({
  kind: z.enum(KINDS),
})

export function wrapAuditPayload(payload: AuditPayload, options: { isError?: boolean } = {}) {
  return createSummaryResult(payload, options)
}

export function summarizeRepoAudit(kind: string, result: RepoAuditLikeResult): string {
  const violationCount = result.violations?.length ?? 0
  if (result.ok) {
    const checked = typeof result.checked === 'number' ? ` (${result.checked} checked)` : ''
    return `${kind} audit passed${checked}`
  }
  return `${kind} audit failed with ${violationCount} violation${violationCount === 1 ? '' : 's'}`
}

function summarizeExitCode(kind: string, exitCode: number): string {
  return exitCode === 0 ? `${kind} audit passed` : `${kind} audit failed (exit ${exitCode})`
}

export async function dispatchAudit(input: AkAuditInput): Promise<AuditPayload> {
  const { kind } = input
  switch (kind) {
    case 'catalog-drift': {
      const { auditCatalogDrift } = await import('#audit/repo-guardrails')
      const auditResult = auditCatalogDrift(input.cwd ?? input.directory ?? process.cwd())
      return {
        passed: auditResult.ok,
        summary: summarizeRepoAudit(kind, auditResult),
        kind,
        details: auditResult,
      }
    }
    case 'package-surface': {
      const { auditPackageSurface } = await import('#audit/package-surface')
      const auditResult = auditPackageSurface(input.cwd ?? input.directory ?? process.cwd())
      return {
        passed: auditResult.ok,
        summary: summarizeRepoAudit(kind, auditResult),
        kind,
        details: auditResult,
      }
    }
    case 'reference-parity-matrix': {
      const { auditReferenceParityMatrix } = await import('#audit/reference-parity-matrix')
      const auditResult = auditReferenceParityMatrix(
        input.cwd ?? input.directory ?? process.cwd(),
        undefined,
        { requireReleaseReady: input.strict },
      )
      return {
        passed: auditResult.ok,
        summary: summarizeRepoAudit(kind, auditResult),
        kind,
        details: auditResult,
      }
    }
    case 'agents': {
      const { auditAgents } = await import('#audit/agents')
      const auditResult = auditAgents(input.cwd ?? input.directory ?? process.cwd())
      return {
        passed: auditResult.ok,
        summary: summarizeRepoAudit(kind, auditResult),
        kind,
        details: auditResult,
      }
    }
    case 'docs-frontmatter': {
      const { auditDocsFrontmatter } = await import('#audit/repo-guardrails')
      const auditResult = auditDocsFrontmatter(input.cwd ?? input.directory ?? process.cwd())
      return {
        passed: auditResult.ok,
        summary: summarizeRepoAudit(kind, auditResult),
        kind,
        details: auditResult,
      }
    }
    case 'blueprint-readme-drift': {
      const { auditBlueprintReadmeDrift } = await import('#audit/blueprint-readme-drift')
      const auditResult = auditBlueprintReadmeDrift(input.cwd ?? input.directory ?? process.cwd())
      return {
        passed: auditResult.ok,
        summary: summarizeRepoAudit(kind, auditResult),
        kind,
        details: auditResult,
      }
    }
    case 'blueprint-pr-coverage': {
      const { auditBlueprintPrCoverage } = await import('#audit/blueprint-pr-coverage')
      const auditResult = auditBlueprintPrCoverage(input.cwd ?? input.directory ?? process.cwd(), {
        baseRef: input.baseRef,
      })
      return {
        passed: auditResult.ok,
        summary: summarizeRepoAudit(kind, auditResult),
        kind,
        details: auditResult,
      }
    }
    case 'blueprint-lifecycle': {
      const { auditBlueprintLifecycleSql } = await import('#audit/blueprint-lifecycle-sql')
      const auditResult = await auditBlueprintLifecycleSql(
        input.cwd ?? input.directory ?? process.cwd(),
      )
      return {
        passed: auditResult.ok,
        summary: summarizeRepoAudit(kind, auditResult),
        kind,
        details: auditResult,
      }
    }
    case 'architecture-drift': {
      const { auditArchitectureDrift } = await import('#audit/architecture-drift')
      const auditResult = auditArchitectureDrift(input.cwd ?? input.directory ?? process.cwd())
      return {
        passed: auditResult.ok,
        summary: summarizeRepoAudit(kind, auditResult),
        kind,
        details: auditResult,
      }
    }
    case 'cloudflare-deploy-contract': {
      const { auditCloudflareDeployContract } = await import('#audit/cloudflare-deploy-contract')
      const auditResult = await auditCloudflareDeployContract(
        input.cwd ?? input.directory ?? process.cwd(),
      )
      return {
        passed: auditResult.ok,
        summary: summarizeRepoAudit(kind, auditResult),
        kind,
        details: auditResult,
      }
    }
    case 'absolute-path-policy': {
      const { auditAbsolutePathPolicy } = await import('#audit/absolute-path-policy')
      const auditResult = auditAbsolutePathPolicy(input.cwd ?? input.directory ?? process.cwd())
      return {
        passed: auditResult.ok,
        summary: summarizeRepoAudit(kind, auditResult),
        kind,
        details: auditResult,
      }
    }
    case 'no-first-party-mjs': {
      const { auditNoFirstPartyMjs } = await import('#audit/no-first-party-mjs')
      const auditResult = auditNoFirstPartyMjs(input.cwd ?? input.directory ?? process.cwd())
      return {
        passed: auditResult.ok,
        summary: summarizeRepoAudit(kind, auditResult),
        kind,
        details: auditResult,
      }
    }
    case 'toolchain-isolation': {
      const { auditToolchainIsolation } = await import('#audit/toolchain-isolation')
      const auditResult = auditToolchainIsolation(input.cwd ?? input.directory ?? process.cwd())
      return {
        passed: auditResult.ok,
        summary: summarizeRepoAudit(kind, auditResult),
        kind,
        details: auditResult,
      }
    }
    case 'session-memory-hardcut': {
      const { auditSessionMemoryHardcut } = await import('#audit/session-memory-hardcut')
      const auditResult = auditSessionMemoryHardcut(input.cwd ?? input.directory ?? process.cwd())
      return {
        passed: auditResult.ok,
        summary: summarizeRepoAudit(kind, auditResult),
        kind,
        details: auditResult,
      }
    }
    case 'roadmap-links': {
      const { auditRoadmapLinks } = await import('#audit/roadmap-links')
      const auditResult = auditRoadmapLinks(input.cwd ?? input.directory ?? process.cwd())
      return {
        passed: auditResult.ok,
        summary: summarizeRepoAudit(kind, auditResult),
        kind,
        details: auditResult,
      }
    }
    case 'commit-message': {
      const messageFile = input.messageFile ?? input.cwd ?? input.directory
      if (!messageFile) {
        return {
          passed: false,
          summary: 'commit-message audit could not run: message file missing',
          kind,
          details: 'commit-message requires a message file via `messageFile` or `directory`.',
        }
      }
      const { auditCommitMessageFile } = await import('#audit/repo-guardrails')
      const auditResult = auditCommitMessageFile(messageFile)
      return {
        passed: auditResult.ok,
        summary: summarizeRepoAudit(kind, auditResult),
        kind,
        details: auditResult,
      }
    }
    case 'tech-debt': {
      const { auditTechDebt } = await import('#audit/tech-debt')
      const auditResult = auditTechDebt(input.cwd ?? input.directory ?? process.cwd())
      return {
        passed: auditResult.ok,
        summary: summarizeRepoAudit(kind, auditResult),
        kind,
        details: auditResult,
      }
    }
    case 'ai-contracts': {
      const { auditAiContracts } = await import('#audit/ai-contracts')
      const auditResult = auditAiContracts(input.cwd ?? input.directory ?? process.cwd())
      return {
        passed: auditResult.ok,
        summary: summarizeRepoAudit(kind, auditResult),
        kind,
        details: auditResult,
      }
    }
    case 'bundle-budget': {
      const { runBundleBudgetCli } = await import('../../vite/local.js')
      const args = input.directory ? [input.directory] : []
      const exitCode = await runBundleBudgetCli(args)
      return {
        passed: exitCode === 0,
        summary: summarizeExitCode(kind, exitCode),
        kind,
        details: { exitCode },
      }
    }
    case 'tph': {
      const { runTphAudit } = await import('#audit/audit-tph-runner')
      const result = await runTphAudit(input.cwd ?? input.directory ?? process.cwd())
      const violations = result.violations.map((v) => ({
        message: `[${v.rule}] ${v.message}`,
        file: v.file,
      }))
      const auditResult = { ok: result.errorCount === 0, checked: result.filesChecked, violations }
      return {
        passed: auditResult.ok,
        summary: summarizeRepoAudit(kind, auditResult),
        kind,
        details: auditResult,
      }
    }
    case 'tph-e2e': {
      const { runTphE2eAudit } = await import('#audit/audit-tph-e2e-runner')
      const result = await runTphE2eAudit(input.cwd ?? input.directory ?? process.cwd())
      const violations = result.violations.map((v) => ({
        message: `[${v.rule}] ${v.message}`,
        file: v.file,
      }))
      const auditResult = { ok: result.errorCount === 0, checked: result.filesChecked, violations }
      return {
        passed: auditResult.ok,
        summary: summarizeRepoAudit(kind, auditResult),
        kind,
        details: auditResult,
      }
    }
    case 'open-source-licenses': {
      const { auditOpenSourceLicenses } = await import('#audit/open-source-licenses')
      const auditResult = auditOpenSourceLicenses(input.cwd ?? input.directory ?? process.cwd())
      return {
        passed: auditResult.ok,
        summary: summarizeRepoAudit(kind, auditResult),
        kind,
        details: auditResult,
      }
    }
    case 'secrets-policy': {
      const { auditSecretsPolicy } = await import('#audit/secrets-policy')
      const auditResult = auditSecretsPolicy(input.cwd ?? input.directory ?? process.cwd())
      return {
        passed: auditResult.ok,
        summary: summarizeRepoAudit(kind, auditResult),
        kind,
        details: auditResult,
      }
    }
    case 'no-dev-vars': {
      const { auditNoDevVars } = await import('#audit/no-dev-vars')
      const auditResult = auditNoDevVars(input.cwd ?? input.directory ?? process.cwd())
      return {
        passed: auditResult.ok,
        summary: summarizeRepoAudit(kind, auditResult),
        kind,
        details: auditResult,
      }
    }
    case 'github-actions-secrets': {
      const { auditGithubActionsSecrets } = await import('#audit/github-actions-secrets')
      const auditResult = auditGithubActionsSecrets(input.cwd ?? input.directory ?? process.cwd())
      return {
        passed: auditResult.ok,
        summary: summarizeRepoAudit(kind, auditResult),
        kind,
        details: auditResult,
      }
    }
    case 'secret-provider-quarantine': {
      const { auditSecretProviderQuarantine } = await import('#audit/secret-provider-quarantine')
      const auditResult = auditSecretProviderQuarantine(
        input.cwd ?? input.directory ?? process.cwd(),
      )
      return {
        passed: auditResult.ok,
        summary: summarizeRepoAudit(kind, auditResult),
        kind,
        details: auditResult,
      }
    }
    case 'secrets-config': {
      const { auditSecretsConfig } = await import('#audit/secrets-config')
      const auditResult = auditSecretsConfig(input.cwd ?? input.directory ?? process.cwd())
      return {
        passed: auditResult.ok,
        summary: summarizeRepoAudit(kind, auditResult),
        kind,
        details: auditResult,
      }
    }
    case 'consumer-agent-kit-dependency': {
      const { auditConsumerAgentKitDependency } =
        await import('#audit/consumer-agent-kit-dependency')
      const auditResult = auditConsumerAgentKitDependency(
        input.cwd ?? input.directory ?? process.cwd(),
      )
      return {
        passed: auditResult.ok,
        summary: summarizeRepoAudit(kind, auditResult),
        kind,
        details: auditResult,
      }
    }
    case 'hook-surface': {
      const { auditHookSurface } = await import('#audit/hook-surface')
      const auditResult = auditHookSurface(input.cwd ?? input.directory)
      return {
        passed: auditResult.passed,
        summary: auditResult.passed
          ? 'hook-surface audit passed'
          : `hook-surface audit failed with ${auditResult.details.violations.length} violation${auditResult.details.violations.length === 1 ? '' : 's'}`,
        kind,
        details: {
          ok: auditResult.details.ok,
          violations: auditResult.details.violations.map((v) => ({
            message: v.reason,
          })),
        },
      }
    }
    case 'harness-surfaces': {
      const { auditHarnessSurfaces } = await import('#audit/harness-surfaces')
      const auditResult = auditHarnessSurfaces(input.cwd ?? input.directory ?? process.cwd())
      return {
        passed: auditResult.ok,
        summary: summarizeRepoAudit(kind, auditResult),
        kind,
        details: auditResult,
      }
    }
    case 'weakness-mining': {
      const { auditWeaknessMining } = await import('#audit/weakness-mining/index')
      const auditResult = await auditWeaknessMining(input.cwd ?? input.directory ?? process.cwd())
      return {
        passed: auditResult.ok,
        summary: summarizeRepoAudit(kind, auditResult),
        kind,
        details: auditResult,
      }
    }
    case 'harness-overlay-evidence': {
      const { auditHarnessOverlayEvidence } = await import('#audit/harness-overlay-evidence')
      const auditResult = auditHarnessOverlayEvidence(input.cwd ?? input.directory ?? process.cwd())
      return {
        passed: auditResult.ok,
        summary: summarizeRepoAudit(kind, auditResult),
        kind,
        details: auditResult,
      }
    }
    case 'no-relative-package-scripts': {
      const { auditNoRelativePackageScripts } = await import('#audit/repo-guardrails')
      const auditResult = auditNoRelativePackageScripts(
        input.cwd ?? input.directory ?? process.cwd(),
      )
      return {
        passed: auditResult.ok,
        summary: auditResult.ok
          ? 'no-relative-package-scripts passed'
          : `no-relative-package-scripts failed: ${auditResult.violations.length} violation${auditResult.violations.length === 1 ? '' : 's'}`,
        kind,
        details: {
          ok: auditResult.ok,
          violations: auditResult.violations,
        },
      }
    }
    default: {
      // Exhaustiveness check — z.enum should make this unreachable.
      const _exhaustive: never = kind
      return {
        passed: false,
        summary: 'audit dispatch hit unreachable case',
        kind: String(_exhaustive),
        details: 'unreachable',
      }
    }
  }
}

const tool: ToolDescriptor = {
  name: 'wp_audit',
  description: `Run a packaged repo audit. \`kind\` selects the audit (${KINDS.join(', ')}). Returns {passed, kind, details}.`,
  inputSchema,
  outputSchema,
  annotations: {
    title: 'Audit',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async (raw): Promise<{ content: { type: string; text: string }[] }> => {
    let input: AkAuditInput
    try {
      input = inputSchema.parse(raw ?? {})
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const kind =
        raw &&
        typeof raw === 'object' &&
        'kind' in raw &&
        typeof (raw as { kind: unknown }).kind === 'string'
          ? (raw as { kind: string }).kind
          : 'unknown'
      // Schema validation failure — agent supplied bad input; isError lets
      // it distinguish "audit ran and found issues" from "audit didn't run".
      return wrapAuditPayload(
        { passed: false, summary: `Invalid wp_audit input for ${kind}`, kind, details: message },
        { isError: true },
      )
    }

    try {
      const payload = await dispatchAudit(input)
      return wrapAuditPayload(payload)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return wrapAuditPayload(
        {
          passed: false,
          summary: `${input.kind} audit crashed`,
          kind: input.kind,
          details: message,
        },
        { isError: true },
      )
    }
  },
}

export default tool
