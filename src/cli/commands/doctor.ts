import type { CAC } from 'cac'

import {
  auditBlueprintLifecycle,
  auditCatalogDrift,
  auditDocsFrontmatter,
  formatRepoAuditReport,
} from '#audit/repo-guardrails'

export interface RunDoctorOptions {
  root?: string
  docsRoot?: string
  fix?: boolean
  legacyOmx?: boolean
}

const REMEDIATIONS: Record<string, string> = {
  'Catalog drift': 'wp audit catalog-drift',
  'Catalog drift — single package (no workspace file)': 'none needed',
  'Docs frontmatter': 'wp audit docs-frontmatter --fix',
  'Blueprint lifecycle': 'wp audit blueprint-lifecycle',
}

export async function runDoctor(options: RunDoctorOptions = {}): Promise<number> {
  try {
    const root = options.root ?? process.cwd()
    const results = [
      auditCatalogDrift(root),
      auditDocsFrontmatter(root, {
        docsRoot: options.docsRoot,
        fix: options.fix,
      }),
      auditBlueprintLifecycle(root, {
        includeLegacyOmx: options.legacyOmx,
      }),
    ]

    let failed = false
    for (const result of results) {
      console.log(formatRepoAuditReport(result))
      if (!result.ok) {
        failed = true
        const remediation =
          REMEDIATIONS[result.title] ??
          `wp audit ${result.title.toLowerCase().replace(/\s+/g, '-')}`
        console.log(`→ remediation: ${remediation}`)
      }
      console.log('')
    }

    console.log('Hook/plugin health remains separate: run `wp hooks doctor`.')
    return failed ? 1 : 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`wp doctor failed: ${message}`)
    return 2
  }
}

export function registerDoctorCommand(cli: CAC): void {
  cli
    .command(
      'doctor',
      'Run repo audit health checks (hook/plugin health stays under `wp hooks doctor`)',
    )
    .option('--root <dir>', 'Repository root to inspect')
    .option('--docs-root <dir>', 'Docs directory for docs-frontmatter')
    .option('--fix', 'Apply supported safe fixes during doctor (currently docs-frontmatter)')
    .option('--legacy-omx', 'Include legacy .omx plan checks for blueprint-lifecycle')
    .action(async (options: RunDoctorOptions) => {
      const code = await runDoctor(options)
      return code
    })
}
