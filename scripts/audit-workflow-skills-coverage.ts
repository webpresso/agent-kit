import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export interface WorkflowSkillsCoverageAuditInput {
  readonly repoRoot?: string
}

export interface WorkflowSkillsCoverageAuditResult {
  readonly sourceRoot: string
  readonly checked: readonly string[]
  readonly missingSources: readonly string[]
  readonly missingTargets: readonly string[]
  readonly staleTargets: readonly string[]
  readonly ok: boolean
}

interface StagingPolicy {
  readonly sourceRoot: string
  readonly skills: readonly {
    readonly name: string
    readonly source: string
    readonly target: string
  }[]
}

function readPolicy(repoRoot: string): StagingPolicy {
  return JSON.parse(
    readFileSync(
      join(repoRoot, 'packages', 'workflow-skills', 'staging', 'allowlist.json'),
      'utf8',
    ),
  ) as StagingPolicy
}

export function auditWorkflowSkillsCoverage(
  input: WorkflowSkillsCoverageAuditInput = {},
): WorkflowSkillsCoverageAuditResult {
  const repoRoot = resolve(input.repoRoot ?? process.cwd())
  const policy = readPolicy(repoRoot)
  const sourceRoot = join(repoRoot, policy.sourceRoot)
  const missingSources: string[] = []
  const missingTargets: string[] = []
  const staleTargets: string[] = []

  for (const skill of policy.skills) {
    const source = join(sourceRoot, skill.source)
    const target = join(repoRoot, skill.target)
    if (!existsSync(source)) {
      missingSources.push(skill.name)
      continue
    }
    if (!existsSync(target)) {
      missingTargets.push(skill.name)
      continue
    }
    if (readFileSync(source, 'utf8') !== readFileSync(target, 'utf8')) {
      staleTargets.push(skill.name)
    }
  }

  return {
    sourceRoot,
    checked: policy.skills.map((skill) => skill.name).toSorted(),
    missingSources: missingSources.sort(),
    missingTargets: missingTargets.sort(),
    staleTargets: staleTargets.sort(),
    ok: missingSources.length === 0 && missingTargets.length === 0 && staleTargets.length === 0,
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = auditWorkflowSkillsCoverage()
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  process.exit(result.ok ? 0 : 1)
}
