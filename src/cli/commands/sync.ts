/**
 * `wp sync` — projects the canonical webpresso rule/skill catalog into the
 * supported host surfaces.
 *
 * Projects unified rule + skill content (catalog ∪ consumer) into per-IDE
 * surfaces according to `DEFAULT_UNIFIED_CONSUMERS`.
 *
 * Flags:
 *   --kind rules|skills   Filter to a single kind (default: both).
 *   --check               Dry-run; exit 1 on first drift, no writes.
 */

import type { CAC } from 'cac'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { validateAgentOverlays } from '#symlinker/overlay-loader'
import { runUnifiedSync, type UnifiedSyncMismatch } from '#symlinker/unified-sync'
import type { ContentKind } from '#content/loader'
import { resolvePackageAsset } from '#utils/package-assets'
import { defaultConfig, readConfig } from './init/config.js'
import {
  detectConsumer,
  isAgentKitTemplateSourceRepo,
  type ConsumerContext,
} from './init/detect-consumer.js'
import { scaffoldAgentsMd } from './init/scaffold-agents-md.js'
import type { MergeResult } from './init/merge.js'

interface SyncCommandOptions {
  kind?: string
  check?: boolean
}

function commandError(message: string, exitCode = 1): Error & { exitCode: number } {
  const err = new Error(message) as Error & { exitCode: number }
  err.exitCode = exitCode
  return err
}

function parseKind(input: string | undefined): readonly ContentKind[] | undefined {
  if (input === undefined) return undefined
  if (input === 'rules' || input === 'rule') return ['rule']
  if (input === 'skills' || input === 'skill') return ['skill']
  throw commandError(`Invalid --kind: ${input}. Must be 'rules' or 'skills'.`)
}

function formatMismatches(mismatches: readonly UnifiedSyncMismatch[]): string {
  return mismatches.map((m) => `  - [${m.consumerId}] ${m.targetPath}: ${m.reason}`).join('\n')
}

function agentsResultToMismatch(result: MergeResult): UnifiedSyncMismatch | null {
  switch (result.action) {
    case 'identical':
      return null
    case 'created':
    case 'overwritten':
      return {
        consumerId: 'agents-md',
        targetPath: result.targetPath,
        reason: 'managed AGENTS.md blocks drifted from the current webpresso template',
      }
    case 'drifted':
      return {
        consumerId: 'agents-md',
        targetPath: result.targetPath,
        reason:
          'AGENTS.md has no managed block markers; review the drift or rerun setup with overwrite once',
      }
    case 'skipped-dry':
      return {
        consumerId: 'agents-md',
        targetPath: result.targetPath,
        reason: 'managed AGENTS.md blocks would be refreshed',
      }
    default:
      return null
  }
}

export function isUnmaterializedAgentKitSourceWorktree(consumer: ConsumerContext): boolean {
  if (!isAgentKitTemplateSourceRepo(consumer.packageJson?.name)) return false

  const requiredPaths = [
    '.agent/rules',
    '.agent/skills',
    '.claude/rules',
    '.claude/skills',
    '.agents/skills',
    '.cursor/rules',
    '.windsurf/skills',
  ]

  return requiredPaths.every((relativePath) => !existsSync(join(consumer.repoRoot, relativePath)))
}

export function registerSyncCommand(cli: CAC): void {
  cli
    .command('sync', 'Sync agent rules + skills across all supported host surfaces')
    .option('--kind <kind>', 'Filter: rules | skills (default: both)')
    .option('--check', 'Exit 1 on drift; no writes')
    .action(async (options: SyncCommandOptions = {}) => {
      const kinds = parseKind(options.kind)
      const repoRoot = process.cwd()
      const catalogDir = resolvePackageAsset('catalog/agent')
      const check = options.check === true

      let result: ReturnType<typeof runUnifiedSync>
      const consumer = detectConsumer(repoRoot)
      if (!consumer) {
        throw commandError('wp sync: could not detect the current git repo root.')
      }
      const agentsResult = scaffoldAgentsMd({
        catalogDir: resolvePackageAsset('catalog'),
        repoRoot,
        consumer,
        config: readConfig(repoRoot) ?? defaultConfig(),
        options: { dryRun: check, overwrite: false },
      })

      if (check && isUnmaterializedAgentKitSourceWorktree(consumer)) {
        console.error(
          `wp sync --check: agent-kit source surfaces are not materialized in this worktree (${consumer.repoRoot}).\n` +
            `  This repo is the source of the canonical agent templates; a fresh git worktree needs\n` +
            `  \`wp sync\` (or \`wp setup --apply --phase projections\`) before \`wp sync --check\` can pass here.`,
        )
        return 1
      }

      const overlayValidation = validateAgentOverlays(repoRoot)
      if (!overlayValidation.ok) {
        const first = overlayValidation.violations[0]
        throw commandError(
          `wp sync: invalid agent overlay${first ? ` at ${first.file ?? 'unknown'}: ${first.message}` : ''}`,
        )
      }
      if (overlayValidation.overlays.length > 0) {
        console.log(`wp sync: validated ${overlayValidation.overlays.length} agent overlay(s).`)
      }

      try {
        result = runUnifiedSync({
          catalogDir,
          consumerRoot: repoRoot,
          ...(kinds ? { kinds } : {}),
          check,
        })
      } catch (error) {
        if (error instanceof Error && /catalogDir does not exist/.test(error.message)) {
          throw commandError(
            'wp sync: webpresso not installed in node_modules. ' + 'Run `vp install` first.',
          )
        }
        throw error
      }

      const agentsMismatch = agentsResult === null ? null : agentsResultToMismatch(agentsResult)
      const combinedFixCount = result.fixCount + (agentsMismatch ? 1 : 0)
      const combinedMismatches = agentsMismatch
        ? [...result.mismatches, agentsMismatch]
        : [...result.mismatches]

      if (check) {
        if (combinedFixCount > 0) {
          const first = combinedMismatches[0]
          if (first) {
            console.error(`wp sync --check: drift detected at ${first.targetPath}`)
            console.error(`  reason: ${first.reason}`)
            console.error(`  consumer: ${first.consumerId}`)
            if (combinedMismatches.length > 1) {
              console.error(`(${combinedMismatches.length - 1} additional drift entries follow)`)
              console.error(formatMismatches(combinedMismatches.slice(1)))
            }
            console.error('\nRun `wp sync` to repair, then commit the changes.')
          } else {
            console.error(`wp sync --check: ${combinedFixCount} drift items detected.`)
          }
          return 1
        }
        console.log('wp sync --check: in sync.')
        return 0
      }

      if (combinedFixCount === 0) {
        console.log('Already up to date.')
        return 0
      }

      console.log(`wp sync: wrote ${combinedFixCount} entries.`)
      console.log('Synced. Restart your IDE to load new rules/skills.')
      return 0
    })
}
