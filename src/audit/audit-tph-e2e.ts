#!/usr/bin/env bun
/**
 * Audit: Testing Philosophy Helper (TPH) - E2E
 *
 * Detects E2E testing guideline violations:
 * - Internal API/handler calls inside E2E tests
 * - Mocks in E2E tests
 * - Dry-run usage in E2E tests
 * - Missing error/edge/mixed-data coverage heuristics
 *
 * Usage:
 *   just audit-tph-e2e
 *   bun apps/scripts/src/audit/audit-tph-e2e.ts
 */

import { findRepoRoot } from '#utils/repo-root'

import { runTphE2eAudit } from './audit-tph-e2e-runner.js'

const root = findRepoRoot()
await runTphE2eAudit(root)
