import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const GENERATED_SKILL_DIRS = ['.claude/skills', '.windsurf/skills', '.agents/skills'] as const

export interface OrphanedSkill {
  readonly name: string
  readonly path: string
  readonly runtimeDir: string
}

function listDirEntries(dir: string): string[] {
  if (!existsSync(dir)) return []
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() || e.isSymbolicLink())
      .map((e) => e.name)
  } catch {
    return []
  }
}

function listCanonicalSkills(cwd: string): Set<string> {
  const canonicalDir = join(cwd, '.agent', 'skills')
  if (!existsSync(canonicalDir)) return new Set()
  try {
    return new Set(
      readdirSync(canonicalDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() || e.isSymbolicLink())
        .map((e) => e.name),
    )
  } catch {
    return new Set()
  }
}

export function findOrphanedSkills(cwd: string): OrphanedSkill[] {
  const canonical = listCanonicalSkills(cwd)
  const orphans: OrphanedSkill[] = []

  for (const runtimeDir of GENERATED_SKILL_DIRS) {
    const absDir = join(cwd, runtimeDir)
    for (const name of listDirEntries(absDir)) {
      if (!canonical.has(name)) {
        orphans.push({
          name,
          path: join(absDir, name),
          runtimeDir,
        })
      }
    }
  }

  return orphans
}

export async function removeOrphanedSkills(
  orphans: readonly OrphanedSkill[],
  dryRun: boolean,
): Promise<void> {
  const canonicalPrefix = '.agent/'
  for (const orphan of orphans) {
    // Safety guard: never remove anything under .agent/
    if (orphan.path.includes(`${canonicalPrefix}skills`)) {
      throw new Error(
        `removeOrphanedSkills: refusing to remove canonical source path: ${orphan.path}`,
      )
    }
    if (!dryRun) {
      rmSync(orphan.path, { recursive: true, force: true })
    }
  }
}
