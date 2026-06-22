import { existsSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export interface GstackCoverageAuditInput {
  readonly repoRoot?: string
  readonly externalRoots?: readonly string[]
}

export interface GstackCoverageAuditResult {
  readonly embeddedRoot: string
  readonly externalRoots: readonly string[]
  readonly embedded: readonly string[]
  readonly external: readonly string[]
  readonly missing: readonly string[]
  readonly ok: boolean
}

function normalizeSkillName(name: string): string {
  return name.replace(/\.md$/u, '').replace(/^gstack-/u, '')
}

function listSkillNames(root: string): string[] {
  if (!existsSync(root)) return []

  const searchRoots = existsSync(join(root, '.agents', 'skills'))
    ? [join(root, '.agents', 'skills')]
    : [root]
  const names = new Set<string>()

  for (const searchRoot of searchRoots) {
    if (existsSync(join(searchRoot, 'SKILL.md'))) {
      names.add(normalizeSkillName(searchRoot.split(/[\\/]/u).at(-1) ?? searchRoot))
    }

    for (const entry of readdirSync(searchRoot)) {
      if (entry.startsWith('.')) continue
      const fullPath = join(searchRoot, entry)
      try {
        const stat = statSync(fullPath)
        if (stat.isDirectory() && existsSync(join(fullPath, 'SKILL.md'))) {
          names.add(normalizeSkillName(entry))
        } else if (stat.isFile() && entry.endsWith('.md') && entry !== 'SKILL.md') {
          names.add(normalizeSkillName(entry))
        }
      } catch {
        // Ignore unreadable entries; the audit is a removal gate, not a filesystem doctor.
      }
    }
  }

  return [...names].sort()
}

export function auditGstackCoverage(
  input: GstackCoverageAuditInput = {},
): GstackCoverageAuditResult {
  const repoRoot = resolve(input.repoRoot ?? process.cwd())
  const embeddedRoot = join(repoRoot, 'packages', 'gstack', 'skills')
  const externalRoots = input.externalRoots ?? [
    join(homedir(), '.claude', 'skills', 'gstack'),
    join(homedir(), '.codex', 'skills', 'gstack'),
  ]
  const embedded = new Set(listSkillNames(embeddedRoot))
  const external = new Set(externalRoots.flatMap((root) => listSkillNames(root)))
  const missing = [...external].filter((skill) => !embedded.has(skill)).sort()
  return {
    embeddedRoot,
    externalRoots,
    embedded: [...embedded].sort(),
    external: [...external].sort(),
    missing,
    ok: missing.length === 0,
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = auditGstackCoverage()
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  process.exit(result.ok ? 0 : 1)
}
