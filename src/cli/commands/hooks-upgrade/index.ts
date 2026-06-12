import { existsSync } from 'node:fs'
import path from 'node:path'

import { getWorkspaceRepos } from '#db/workspace-config.js'
import {
  readHooksManifest,
  withHookVendorState,
  writeHooksManifest,
} from '#cli/commands/init/scaffolders/agent-hooks/manifest.js'
import {
  disableManagedHooksFromManifest,
  scaffoldAgentHooks,
  trustCodexWebpressoHooksForRepo,
} from '#cli/commands/init/scaffolders/agent-hooks/index.js'
import {
  normalizeGlobalCodexHooksFile,
} from '#cli/commands/init/scaffolders/agent-hooks/codex-global-normalize.js'
import { setupCommandForRepo } from '#cli/commands/init/detect-consumer.js'
import { deriveHookStatus } from '#hooks/status/index.js'
import { readInstalledHooksMap } from '#hooks/shared/installed-hooks.js'
import type { MergeOptions, MergeResult } from '#cli/commands/init/merge.js'

export interface HooksUpgradeCommandDeps {
  readonly cwd?: string
  readonly stdout?: Pick<NodeJS.WriteStream, 'write'>
  readonly trustCodexHooks?: boolean
  readonly workspaceRepos?: readonly string[]
}

export interface HooksUpgradeTargetReport {
  readonly repoRoot: string
  readonly mode: 'single' | 'workspace'
  readonly apply: boolean
  readonly results: readonly MergeResult[]
  readonly warnings: readonly string[]
  readonly beforeSummary: string
  readonly projectedSummary: string
}

function parseFlag(argv: readonly string[], flag: string): boolean {
  return argv.includes(flag)
}

function summarizeVendorState(
  repoRoot: string,
  vendor: 'claude' | 'codex',
  manifestState: 'enabled' | 'disabled',
): string {
  const hooksMap = readInstalledHooksMap(repoRoot, vendor)
  const details = deriveHookStatus({
    hooksMap,
    vendor,
    manifestExists: true,
    vendorState: manifestState,
  })
  const counts = new Map<string, number>()
  for (const detail of details) {
    counts.set(detail.status, (counts.get(detail.status) ?? 0) + 1)
  }
  const parts = [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([status, count]) => `${status}:${count}`)
  return `${vendor}[${parts.join(', ')}]`
}

function summarizeProjectedState(
  repoRoot: string,
  vendorState: { claude: 'enabled' | 'disabled'; codex: 'enabled' | 'disabled' },
): string {
  return [
    summarizeVendorState(repoRoot, 'claude', vendorState.claude),
    summarizeVendorState(repoRoot, 'codex', vendorState.codex),
  ].join('; ')
}

function uniqueRepoRoots(
  currentRoot: string,
  workspaceRepos: readonly string[],
  includeWorkspace: boolean,
): string[] {
  if (!includeWorkspace) return [currentRoot]
  return [...new Set([currentRoot, ...workspaceRepos])]
}

function formatReport(
  report: HooksUpgradeTargetReport,
  stdout: Pick<NodeJS.WriteStream, 'write'>,
): void {
  stdout.write(`wp hooks upgrade: ${report.repoRoot}\n`)
  stdout.write(`  scope: ${report.mode}\n`)
  stdout.write(`  mode: ${report.apply ? 'apply' : 'dry-run'}\n`)
  stdout.write(`  before: ${report.beforeSummary}\n`)
  stdout.write(`  projected: ${report.projectedSummary}\n`)
  for (const result of report.results) {
    const relative = path.relative(report.repoRoot, result.targetPath) || result.targetPath
    stdout.write(`  - ${relative}: ${result.action}\n`)
  }
  for (const warning of report.warnings) {
    stdout.write(`  warning: ${warning}\n`)
  }
}

export async function upgradeHooksForRepo(
  repoRoot: string,
  options: { apply: boolean; trustCodexHooks: boolean },
): Promise<HooksUpgradeTargetReport> {
  const manifest = readHooksManifest(repoRoot)
  if (manifest === null) {
    const setupCommand = setupCommandForRepo(repoRoot)
    return {
      repoRoot,
      mode: 'single',
      apply: options.apply,
      results: [],
      warnings: [
        `missing .webpresso/hooks-manifest.json — run \`${setupCommand}\` before hooks upgrades`,
      ],
      beforeSummary: 'manifest-missing',
      projectedSummary: 'manifest-missing',
    }
  }

  const beforeSummary = summarizeProjectedState(repoRoot, manifest.vendorState)
  const mergeOptions: MergeOptions = options.apply ? {} : { dryRun: true }
  const scaffoldInput = { repoRoot, options: mergeOptions, trustCodexHooks: false } as const

  const scaffolded = await scaffoldAgentHooks(scaffoldInput)
  let nextManifest = withHookVendorState(scaffolded.manifest, ['claude', 'codex'], 'enabled')
  let results: MergeResult[] = [scaffolded.claude, scaffolded.codex]

  const disabledVendors = (['claude', 'codex'] as const).filter(
    (vendor) => manifest.vendorState[vendor] === 'disabled',
  )
  if (disabledVendors.length > 0) {
    const disabledMutation = disableManagedHooksFromManifest(
      scaffoldInput,
      nextManifest,
      disabledVendors,
    )
    results = [
      ...results,
      ...[disabledMutation.claude, disabledMutation.codex].filter(
        (result): result is MergeResult => result !== undefined,
      ),
    ]
    nextManifest = withHookVendorState(nextManifest, disabledVendors, 'disabled')
  }

  const warnings = options.apply
    ? []
    : ['dry-run only — re-run with `--apply` after reviewing the projected delta']

  if (options.apply) {
    writeHooksManifest(repoRoot, nextManifest.claude, nextManifest.codex, nextManifest.vendorState)
    normalizeGlobalCodexHooksFile(
      path.join(repoRoot, '.codex', 'hooks.json'),
      {
        nodeBinary: process.execPath,
      },
      {},
    )
    if (options.trustCodexHooks && nextManifest.vendorState.codex === 'enabled') {
      await trustCodexWebpressoHooksForRepo({ repoRoot, options: {}, trustCodexHooks: false })
    }
  }

  return {
    repoRoot,
    mode: 'single',
    apply: options.apply,
    results,
    warnings,
    beforeSummary,
    projectedSummary: summarizeProjectedState(repoRoot, nextManifest.vendorState),
  }
}

export async function hooksUpgradeCommand(
  argv: readonly string[],
  deps: HooksUpgradeCommandDeps = {},
): Promise<number> {
  const cwd = deps.cwd ?? process.cwd()
  const stdout = deps.stdout ?? process.stdout
  const apply = parseFlag(argv, '--apply')
  const workspace = parseFlag(argv, '--workspace')
  const repos = uniqueRepoRoots(cwd, deps.workspaceRepos ?? getWorkspaceRepos(), workspace).filter(
    (repoRoot) => existsSync(repoRoot),
  )

  if (repos.length === 0) {
    stdout.write('wp hooks upgrade: no repos found\n')
    return 1
  }

  for (const repoRoot of repos) {
    const report = await upgradeHooksForRepo(repoRoot, {
      apply,
      trustCodexHooks: deps.trustCodexHooks ?? apply,
    })
    formatReport({ ...report, mode: workspace ? 'workspace' : 'single' }, stdout)
  }

  return 0
}
