/**
 * Validate plan has required template sections.
 */

import type { ValidationResult } from '#core/types'

import { checkAcceptanceCriteria } from './criteria'

/**
 * Check for required overview sections.
 */
function checkRequiredOverview(markdown: string): ValidationResult {
  const hasOverview =
    /^## Overview/m.test(markdown) ||
    /^## Problem Statement/m.test(markdown) ||
    /^## Problem & Goal/m.test(markdown)

  if (!hasOverview) {
    return {
      valid: false,
      error: 'Plan missing required section: ## Overview (or ## Problem Statement)',
    }
  }
  return { valid: true }
}

/**
 * Check for required acceptance criteria.
 */
function checkRequiredCriteria(markdown: string): ValidationResult {
  const hasAcceptanceCriteria = /^## Acceptance Criteria/m.test(markdown)
  const criteria = checkAcceptanceCriteria(markdown)

  if (!hasAcceptanceCriteria && criteria.total === 0) {
    return {
      valid: false,
      error: 'Plan missing required section: ## Acceptance Criteria (with checkboxes)',
    }
  }
  return { valid: true }
}

/**
 * Check for required implementation sections.
 */
function checkRequiredImplementation(markdown: string): ValidationResult {
  const hasImplementation =
    /^## Phases/m.test(markdown) ||
    /^## Tasks/m.test(markdown) ||
    /^## Implementation/m.test(markdown) ||
    /^### Phase \d/m.test(markdown)

  if (!hasImplementation) {
    return {
      valid: false,
      error: 'Plan missing required section: ## Phases (or ## Tasks or ## Implementation)',
    }
  }
  return { valid: true }
}

/**
 * Validate plan has required template sections.
 */
export function validatePlanTemplate(markdown: string): ValidationResult {
  const hasOverview = checkRequiredOverview(markdown)
  if (!hasOverview.valid) return hasOverview

  const hasCriteria = checkRequiredCriteria(markdown)
  if (!hasCriteria.valid) return hasCriteria

  const hasImplementation = checkRequiredImplementation(markdown)
  if (!hasImplementation.valid) return hasImplementation

  return { valid: true }
}
