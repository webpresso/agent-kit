/**
 * Integration test for blueprintToSpecKit.
 * Uses the real elegance-pass-2026 blueprint fixture via parseBlueprintForDb.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { parseBlueprintForDb } from '../../db/parser/blueprint-db-parser.js'
import { blueprintToSpecKit } from './index.js'

// ---------------------------------------------------------------------------
// Real fixture from blueprints/completed/elegance-pass-2026/_overview.md
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..')
const FIXTURE_PATH = path.join(
  REPO_ROOT,
  'blueprints/completed/elegance-pass-2026/_overview.md',
)

const FIXTURE_CONTENT = readFileSync(FIXTURE_PATH, 'utf-8')
const FIXTURE_SLUG = 'elegance-pass-2026'
const PARSED = parseBlueprintForDb(FIXTURE_CONTENT, FIXTURE_PATH, FIXTURE_SLUG)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('blueprintToSpecKit (integration)', () => {
  it('returns a bundle with all 4 non-empty files', () => {
    const bundle = blueprintToSpecKit(PARSED, REPO_ROOT)
    expect(bundle.spec.length).toBeGreaterThan(0)
    expect(bundle.plan.length).toBeGreaterThan(0)
    expect(bundle.tasks.length).toBeGreaterThan(0)
    expect(bundle.constitution.length).toBeGreaterThan(0)
  })

  it('spec contains title and required sections', () => {
    const bundle = blueprintToSpecKit(PARSED, REPO_ROOT)
    expect(bundle.spec).toContain('— Specification')
    expect(bundle.spec).toContain('## Overview')
    expect(bundle.spec).toContain('## User Scenarios')
    expect(bundle.spec).toContain('## Requirements')
    expect(bundle.spec).toContain('## Review Checklist')
  })

  it('plan references spec.md and contains Waves', () => {
    const bundle = blueprintToSpecKit(PARSED, REPO_ROOT)
    expect(bundle.plan).toContain('[spec.md](spec.md)')
    expect(bundle.plan).toContain('## Waves')
  })

  it('tasks has - [ ] checkboxes', () => {
    const bundle = blueprintToSpecKit(PARSED, REPO_ROOT)
    expect(bundle.tasks).toMatch(/- \[ \]/)
  })

  it('constitution contains Repository Constitution header', () => {
    const bundle = blueprintToSpecKit(PARSED, REPO_ROOT)
    expect(bundle.constitution).toContain('# Repository Constitution')
    expect(bundle.constitution).toContain('## Key Principles')
  })

  it('no string is shared verbatim across spec, plan, tasks (no cross-file duplication)', () => {
    const bundle = blueprintToSpecKit(PARSED, REPO_ROOT)
    // The title suffix patterns are unique per file — not duplicated
    const specSuffix = '— Specification'
    const planSuffix = '— Implementation Plan'
    const tasksSuffix = '— Tasks'

    expect(bundle.spec).toContain(specSuffix)
    expect(bundle.plan).not.toContain(specSuffix)
    expect(bundle.tasks).not.toContain(specSuffix)

    expect(bundle.plan).toContain(planSuffix)
    expect(bundle.spec).not.toContain(planSuffix)
    expect(bundle.tasks).not.toContain(planSuffix)

    expect(bundle.tasks).toContain(tasksSuffix)
    expect(bundle.spec).not.toContain(tasksSuffix)
    expect(bundle.plan).not.toContain(tasksSuffix)
  })

  it('constitution does not repeat spec/plan/tasks body content', () => {
    const bundle = blueprintToSpecKit(PARSED, REPO_ROOT)
    // constitution must not duplicate task checklist or user scenarios
    expect(bundle.constitution).not.toContain('## User Scenarios')
    expect(bundle.constitution).not.toContain('## Waves')
    expect(bundle.constitution).not.toContain('- [ ]')
  })
})
