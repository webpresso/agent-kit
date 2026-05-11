import { execSync } from 'node:child_process'

import type { SectionDirective } from './directives.schema.js'

export interface RotationLogEntry {
  readonly sectionSlug: string
  readonly archiveTo: string
  readonly reason: string
  readonly timestamp: string
}

export interface DirectiveContext {
  readonly dryRun: boolean
  readonly isShallowClone: boolean
  readonly rotationLog: RotationLogEntry[]
  readonly warnings: string[]
  readonly cwd?: string
  readonly filePath?: string
}

function getSectionLastTouchedAgeMs(filePath: string, cwd: string | undefined): number | undefined {
  try {
    const result = execSync(`git log -1 --format=%ct -- "${filePath}"`, {
      cwd: cwd ?? process.cwd(),
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    if (!result) return undefined
    const epochSeconds = parseInt(result, 10)
    if (isNaN(epochSeconds)) return undefined
    return Date.now() - epochSeconds * 1000
  } catch {
    return undefined
  }
}

export function applyDirectives(
  sections: Map<string, { heading: string; content: string }>,
  directives: readonly SectionDirective[],
  context: DirectiveContext,
): Map<string, { heading: string; content: string }> {
  const result = new Map(sections)

  for (const directive of directives) {
    const slug = directive.heading.toLowerCase().replace(/\s+/gu, '-')

    if (directive.op === 'rotate') {
      if (context.isShallowClone) {
        context.warnings.push(
          `rotate skipped for section "${directive.heading}": shallow clone detected`,
        )
        continue
      }

      // rotation_eligible must be explicitly true; skip if not set
      if (directive.rotation_eligible !== true) continue

      const archiveTo = directive.archive_to ?? 'AGENTS.history.md'
      const thresholdDays = directive.threshold_days ?? 180
      const keepSummary = directive.keep_summary ?? true

      // Check age if file path is known
      let shouldRotate = false
      if (context.filePath) {
        const ageMs = getSectionLastTouchedAgeMs(context.filePath, context.cwd)
        if (ageMs !== undefined) {
          const ageDays = ageMs / (1000 * 60 * 60 * 24)
          shouldRotate = ageDays > thresholdDays
        }
      }

      if (!shouldRotate) continue

      if (context.dryRun) {
        context.rotationLog.push({
          sectionSlug: slug,
          archiveTo,
          reason: `dry-run: section age > ${thresholdDays} days`,
          timestamp: new Date().toISOString(),
        })
        continue
      }

      const existing = result.get(slug)
      if (!existing) continue

      // Remove section from main output, add summary if keep_summary
      result.delete(slug)
      if (keepSummary) {
        result.set(`${slug}-archived`, {
          heading: `${existing.heading} (archived)`,
          content: `_Rotated to ${archiveTo} on ${new Date().toISOString().slice(0, 10)}_\n`,
        })
      }

      context.rotationLog.push({
        sectionSlug: slug,
        archiveTo,
        reason: `section age > ${thresholdDays} days`,
        timestamp: new Date().toISOString(),
      })
      continue
    }

    if (directive.op === 'replace') {
      const existing = result.get(slug)
      if (existing && directive.content !== undefined) {
        result.set(slug, { heading: existing.heading, content: directive.content })
      }
      continue
    }

    if (directive.op === 'append') {
      const existing = result.get(slug)
      if (existing && directive.content !== undefined) {
        result.set(slug, {
          heading: existing.heading,
          content: existing.content + '\n' + directive.content,
        })
      }
      continue
    }

    if (directive.op === 'prepend') {
      const existing = result.get(slug)
      if (existing && directive.content !== undefined) {
        result.set(slug, {
          heading: existing.heading,
          content: directive.content + '\n' + existing.content,
        })
      }
      continue
    }

    if (directive.op === 'delete') {
      result.delete(slug)
      continue
    }
  }

  return result
}
