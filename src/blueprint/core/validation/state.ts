/**
 * Validate plan state consistency with folder structure and checkbox status.
 */

import type { CriteriaResult, ValidationResult } from '#core/types'

import { planStatusSchema } from '#core/schema'

import { checkAcceptanceCriteria } from './criteria.js'

/**
 * Validate plan is in completed/ folder if status is completed.
 */
function validateCompletedFolder(
  status: string,
  isInCompleted: boolean,
  criteria: CriteriaResult,
): ValidationResult {
  if (status === 'completed' && !isInCompleted) {
    return {
      valid: false,
      error:
        'Plan has status: completed but is not in completed/ folder. Move it with: git mv <path> webpresso/blueprints/completed/',
    }
  }

  if (isInCompleted && status !== 'completed') {
    return {
      valid: false,
      error: `Plan is in completed/ folder but has status: ${status} (expected status: completed)`,
    }
  }

  if (status === 'completed' && !criteria.allChecked) {
    return {
      valid: false,
      error: `Plan has status: completed but only ${criteria.checked}/${criteria.total} acceptance criteria are checked`,
    }
  }
  return { valid: true }
}

/**
 * Validate plan is in draft/ folder if status is draft.
 */
function validateDraftFolder(
  status: string,
  isInDraft: boolean,
  criteria: CriteriaResult,
): ValidationResult {
  if (status === 'draft' && !isInDraft) {
    return {
      valid: false,
      error:
        'Plan has status: draft but is not in draft/ folder. Move it with: git mv <path> webpresso/blueprints/draft/',
    }
  }

  if (isInDraft && status !== 'draft') {
    return {
      valid: false,
      error: `Plan is in draft/ folder but has status: ${status} (expected status: draft)`,
    }
  }

  if (status === 'draft' && criteria.checked > 0) {
    return {
      valid: false,
      error: `Plan has status: draft but ${criteria.checked} acceptance criteria are checked (expected 0)`,
    }
  }
  return { valid: true }
}

/**
 * Validate plan is in parked/ folder if status is parked.
 */
function validateParkedFolder(status: string, isInParked: boolean): ValidationResult {
  if (status === 'parked' && !isInParked) {
    return {
      valid: false,
      error:
        'Plan has status: parked but is not in parked/ folder. Move it with: git mv <path> webpresso/blueprints/parked/',
    }
  }

  if (isInParked && status !== 'parked') {
    return {
      valid: false,
      error: `Plan is in parked/ folder but has status: ${status} (expected status: parked)`,
    }
  }

  return { valid: true }
}

/**
 * Validate state without path information.
 */
function validateStateOnly(status: string, criteria: CriteriaResult): ValidationResult {
  if (status === 'completed' && !criteria.allChecked) {
    return { valid: false, error: 'Plan completed but criteria not met' }
  }
  if (status === 'draft' && criteria.checked > 0) {
    return { valid: false, error: 'Plan draft but criteria checked' }
  }
  return { valid: true }
}

/**
 * Validate state with path information.
 */
function validateStateWithPath(
  status: string,
  filePath: string,
  criteria: CriteriaResult,
): ValidationResult {
  const isInCompleted = filePath.includes('/completed/') || filePath.includes('completed/')
  const isInDraft = filePath.includes('/draft/') || filePath.includes('draft/')
  const isInParked = filePath.includes('/parked/') || filePath.includes('parked/')

  const completedResult = validateCompletedFolder(status, isInCompleted, criteria)
  if (!completedResult.valid) return completedResult

  const draftResult = validateDraftFolder(status, isInDraft, criteria)
  if (!draftResult.valid) return draftResult

  const parkedResult = validateParkedFolder(status, isInParked)
  if (!parkedResult.valid) return parkedResult

  return { valid: true }
}

/**
 * Validate plan state consistency.
 */
export function validatePlanState(markdown: string, filePath?: string): ValidationResult {
  const statusMatch = markdown.match(/^status:\s*(\S+)/m)
  const status = statusMatch?.[1]

  if (!status) {
    return { valid: true }
  }

  if (!planStatusSchema.safeParse(status).success) {
    return {
      valid: false,
      error: `Plan has invalid status: ${status}. Valid statuses: ${planStatusSchema.options.join(', ')}`,
    }
  }

  const criteria = checkAcceptanceCriteria(markdown)

  if (!filePath) {
    return validateStateOnly(status, criteria)
  }

  return validateStateWithPath(status, filePath, criteria)
}
