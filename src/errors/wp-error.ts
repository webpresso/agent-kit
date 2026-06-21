import { redactText } from '#mcp/tools/_shared/redact.js'

export interface WpErrorEnvelope {
  readonly code: string
  readonly problem: string
  readonly cause: string
  readonly fix: string
  readonly docsUrl: string
  readonly evidence: unknown
  readonly redacted: boolean
}

export interface CreateWpErrorEnvelopeInput {
  readonly code: string
  readonly problem: string
  readonly cause: string
  readonly fix: string
  readonly docsUrl: string
  readonly evidence: unknown
  readonly redact?: readonly string[]
}

const DOCS_URL_PATTERN = /^docs\/errors\/[a-z0-9-]+\.md(?:#[a-z0-9_-]+)?$/u
const WP_ERROR_CODE_PATTERN = /^WP_[A-Z0-9_]+$/u

export function isWpErrorCode(value: string): boolean {
  return WP_ERROR_CODE_PATTERN.test(value)
}

export function validateWpErrorDocsUrl(value: string): string {
  if (!DOCS_URL_PATTERN.test(value)) {
    throw new Error('docsUrl must point to docs/errors/*.md with an optional anchor.')
  }
  return value
}

function redactStringValue(
  value: string,
  explicitSecrets: readonly string[],
): { value: string; redacted: boolean } {
  let next = redactText(value) ?? value
  let redacted = next !== value
  for (const secret of [...explicitSecrets].sort((left, right) => right.length - left.length)) {
    if (!secret) continue
    if (next.includes(secret)) {
      next = next.split(secret).join('[REDACTED]')
      redacted = true
    }
  }
  return { value: next, redacted }
}

function redactEvidence(
  value: unknown,
  explicitSecrets: readonly string[],
): { value: unknown; redacted: boolean } {
  if (typeof value === 'string') {
    return redactStringValue(value, explicitSecrets)
  }
  if (Array.isArray(value)) {
    let redacted = false
    const items = value.map((entry) => {
      const next = redactEvidence(entry, explicitSecrets)
      redacted ||= next.redacted
      return next.value
    })
    return { value: items, redacted }
  }
  if (!value || typeof value !== 'object') {
    return { value, redacted: false }
  }
  let redacted = false
  const entries = Object.entries(value).map(([key, entry]) => {
    const next = redactEvidence(entry, explicitSecrets)
    redacted ||= next.redacted
    return [key, next.value]
  })
  return { value: Object.fromEntries(entries), redacted }
}

export function createWpErrorEnvelope(input: CreateWpErrorEnvelopeInput): WpErrorEnvelope {
  if (!isWpErrorCode(input.code)) {
    throw new Error(`Invalid WP error code: ${input.code}`)
  }
  const docsUrl = validateWpErrorDocsUrl(input.docsUrl)
  const { value, redacted } = redactEvidence(input.evidence, input.redact ?? [])
  return {
    code: input.code,
    problem: input.problem,
    cause: input.cause,
    fix: input.fix,
    docsUrl,
    evidence: value,
    redacted,
  }
}
