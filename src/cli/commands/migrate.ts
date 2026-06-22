import { existsSync, readFileSync } from 'node:fs'
import { globSync } from 'glob'
import { join } from 'node:path'

import type { CAC } from 'cac'

export interface MigrationPatch {
  readonly file: string
  readonly action: 'delete' | 'replace' | 'remove-dependency'
  readonly reason: string
}

export interface MigrateSecretsOptions {
  readonly cwd?: string
  readonly json?: boolean
}

export function registerMigrateCommand(cli: CAC): void {
  cli
    .command('migrate <target>', 'Migration helpers (currently `migrate secrets`)')
    .option('--dry-run', 'Emit planned patch suggestions only')
    .option('--json', 'Emit machine-readable JSON')
    .action((target: string, flags: Record<string, unknown>) => {
      if (target !== 'secrets') {
        process.stderr.write(`Unknown migrate target: ${target}. Use "secrets".\n`)
        return 1
      }
      return runMigrateSecretsCommand({
        cwd: process.cwd(),
        json: Boolean(flags.json),
      })
    })
}

export function runMigrateSecretsCommand(options: MigrateSecretsOptions = {}): number {
  const cwd = options.cwd ?? process.cwd()
  const patches: MigrationPatch[] = []

  const packageJsonPath = join(cwd, 'package.json')
  if (existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      scripts?: Record<string, string>
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    for (const [name, script] of Object.entries(packageJson.scripts ?? {})) {
      if (script.includes('act-with-webpresso.ts') || script.includes('act-secret-profile.ts')) {
        patches.push({
          file: 'package.json',
          action: 'replace',
          reason: `Replace script "${name}" with wp ci act.`,
        })
      }
      if (script.includes('with-secrets --')) {
        patches.push({
          file: 'package.json',
          action: 'replace',
          reason: `Replace script "${name}" with shared wp preview/deploy/e2e commands.`,
        })
      }
    }
    if (
      packageJson.dependencies?.['@webpresso/agent-kit'] ||
      packageJson.devDependencies?.['@webpresso/agent-kit']
    ) {
      patches.push({
        file: 'package.json',
        action: 'remove-dependency',
        reason: 'Remove consumer dependency on @webpresso/agent-kit.',
      })
    }
  }

  for (const file of ['scripts/act-with-webpresso.ts', 'scripts/act-secret-profile.ts']) {
    if (existsSync(join(cwd, file))) {
      patches.push({ file, action: 'delete', reason: 'Delete legacy local act helper.' })
    }
  }

  for (const workflowFile of globSync('.github/workflows/*.{yml,yaml}', { cwd, nodir: true })) {
    const text = readFileSync(join(cwd, workflowFile), 'utf8')
    if (text.includes('secrets: inherit')) {
      patches.push({
        file: workflowFile,
        action: 'replace',
        reason: 'Replace secrets: inherit with explicit lane-named secrets.',
      })
    }
    if (text.includes('environment:')) {
      patches.push({
        file: workflowFile,
        action: 'replace',
        reason: 'Remove GitHub Environment secret dependency from reusable secret flows.',
      })
    }
  }

  const payload = { ok: true, code: 'WP_MIGRATE_SECRETS_PATCH_PLAN', patches }
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
  return 0
}
