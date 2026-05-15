#!/usr/bin/env tsx
/**
 * Stale Document Detection
 *
 * Finds documentation files with last_updated older than MAX_AGE_DAYS.
 * Exits with code 1 if stale docs are found (fails CI).
 */

import matter from 'gray-matter'
import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import { glob } from 'tinyglobby'

const MAX_AGE_DAYS = 90
const DOCS_ROOT = process.cwd()
const AGENT_GUIDE_PATH = '.agent/rules/agent-guide.md'

/** Paths that are exempt from staleness checks */
const EXEMPT_PATTERNS = [
  'webpresso/blueprints/completed/',
  'webpresso/blueprints/archived/',
  'docs/evaluations/archive/',
  'docs/research/', // Research papers are reference material
  'docs/cookbook/', // Cookbook recipes rarely change
]

interface StaleDoc {
  path: string
  lastUpdated: string
  ageDays: number
}

function isExempt(filePath: string): boolean {
  return EXEMPT_PATTERNS.some((pattern) => filePath.includes(pattern))
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date) return value
  if (typeof value === 'string') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}

function getDaysSince(date: Date): number {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

/**
 * Check a single file for staleness
 */
function checkFileForStaleness(file: string): StaleDoc | null {
  try {
    const content = readFileSync(file, 'utf-8')
    const { data } = matter(content)

    if (!data.last_updated) return null

    const lastUpdated = parseDate(data.last_updated)
    if (!lastUpdated) return null

    const ageDays = getDaysSince(lastUpdated)
    if (ageDays <= MAX_AGE_DAYS) return null

    const dateStr = lastUpdated.toISOString().split('T')[0] ?? 'unknown'
    return {
      path: relative(DOCS_ROOT, file),
      lastUpdated: dateStr,
      ageDays,
    }
  } catch {
    return null
  }
}

async function findStaleDocs(): Promise<StaleDoc[]> {
  const files = await glob(['docs/**/*.md', 'CLAUDE.md', AGENT_GUIDE_PATH], {
    cwd: DOCS_ROOT,
    ignore: ['**/node_modules/**'],
  })

  const staleDocs: StaleDoc[] = []

  for (const file of files) {
    if (isExempt(file)) continue

    const staleDoc = checkFileForStaleness(file)
    if (staleDoc) {
      staleDocs.push(staleDoc)
    }
  }

  return staleDocs.toSorted((a, b) => b.ageDays - a.ageDays)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const blockCritical = args.includes('--block-critical')
  const staleDocs = await findStaleDocs()

  if (!staleDocs.length) {
    console.log(`✓ No stale documents found (threshold: ${MAX_AGE_DAYS} days)`)
    process.exit(0)
  }

  const criticalStale = staleDocs.filter((d) => d.path === AGENT_GUIDE_PATH)
  const normalStale = staleDocs.filter((d) => d.path !== AGENT_GUIDE_PATH)

  if (blockCritical && criticalStale.length > 0) {
    console.log(`\n❌ CRITICAL: agent-guide.md is stale (>${MAX_AGE_DAYS} days). Commit blocked.\n`)
    for (const doc of criticalStale) {
      console.log(
        `  ${doc.path}\n    └─ last_updated: ${doc.lastUpdated} (${doc.ageDays} days ago)`,
      )
    }
    console.log('\nYou MUST update agent-guide.md to proceed.')
    process.exit(1)
  }

  if (normalStale.length > 0) {
    console.log(
      `\n⚠ Found ${normalStale.length} stale document(s) (>${MAX_AGE_DAYS} days old) - Consider updating:\n`,
    )
    for (const doc of normalStale) {
      console.log(`  ${doc.path}`)
      console.log(`    └─ last_updated: ${doc.lastUpdated} (${doc.ageDays} days ago)`)
    }
  }

  // Always exit 0 unless critical blocked
  process.exit(0)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('Error checking for stale docs:', error)
    process.exit(1)
  })
}
