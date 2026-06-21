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

export interface WpErrorInit {
  readonly code: `WP_${string}`
  readonly problem: string
  readonly cause?: string
  readonly fix?: string
  readonly docsPath?: string
  readonly evidence?: readonly string[] | string
}

export interface WpErrorJson {
  readonly ok: false
  readonly code: `WP_${string}`
  readonly problem: string
  readonly cause?: string
  readonly fix?: string
  readonly docsUrl?: string
  readonly evidence?: readonly string[]
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

function redactUnknownEvidence(
  value: unknown,
  explicitSecrets: readonly string[],
): { value: unknown; redacted: boolean } {
  if (typeof value === 'string') {
    return redactStringValue(value, explicitSecrets)
  }
  if (Array.isArray(value)) {
    let redacted = false
    const items = value.map((entry) => {
      const next = redactUnknownEvidence(entry, explicitSecrets)
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
    const next = redactUnknownEvidence(entry, explicitSecrets)
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
  const { value, redacted } = redactUnknownEvidence(input.evidence, input.redact ?? [])
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

function normalizeEvidence(evidence: WpErrorInit['evidence']): readonly string[] {
  return typeof evidence === 'string' ? [evidence] : [...(evidence ?? [])]
}

function redactEvidenceText(value: string, secrets: readonly string[] = []): string {
  return redactStringValue(value, secrets).value
}

export class WpError extends Error {
  readonly code: `WP_${string}`
  readonly causeText?: string
  readonly fix?: string
  readonly docsPath?: string
  readonly evidence?: readonly string[]

  constructor(input: WpErrorInit) {
    super(input.problem)
    this.name = 'WpError'
    this.code = input.code
    const rawEvidence = normalizeEvidence(input.evidence)
    this.causeText = input.cause ? redactEvidenceText(input.cause, rawEvidence) : undefined
    this.fix = input.fix
    this.docsPath = input.docsPath
    this.evidence = rawEvidence.map((value) => redactEvidenceText(value, rawEvidence))
  }
}

export function createWpError(input: WpErrorInit): WpError {
  return new WpError(input)
}

export function toWpErrorJson(error: WpError): WpErrorJson {
  return {
    ok: false,
    code: error.code,
    problem: error.message,
    ...(error.causeText ? { cause: redactEvidenceText(error.causeText) } : {}),
    ...(error.fix ? { fix: error.fix } : {}),
    ...(error.docsPath ? { docsUrl: error.docsPath } : {}),
    ...(error.evidence && error.evidence.length > 0 ? { evidence: error.evidence } : {}),
  }
}

export function formatWpError(error: WpError): string {
  return [
    `${error.code}: ${error.message}`,
    error.causeText ? `cause: ${redactEvidenceText(error.causeText)}` : '',
    error.fix ? `fix: ${error.fix}` : '',
    error.docsPath ? `docs: ${error.docsPath}` : '',
    error.evidence && error.evidence.length > 0 ? `evidence: ${error.evidence.join(' | ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export function ensureWpError(
  error: unknown,
  fallback: Omit<WpErrorInit, 'problem'> & { readonly problem?: string },
): WpError {
  if (error instanceof WpError) return error
  if (error instanceof Error) {
    return createWpError({
      ...fallback,
      problem: fallback.problem ?? error.message,
      cause: error.message,
    })
  }
  return createWpError({
    ...fallback,
    problem: fallback.problem ?? String(error),
    cause: String(error),
  })
}
