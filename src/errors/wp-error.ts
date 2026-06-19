import { redactText } from '#mcp/tools/_shared/redact.js'

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
    const rawEvidence =
      typeof input.evidence === 'string' ? [input.evidence] : [...(input.evidence ?? [])]
    this.causeText = input.cause ? redactEvidence(input.cause, rawEvidence) : undefined
    this.fix = input.fix
    this.docsPath = input.docsPath
    this.evidence =
      rawEvidence.map((value) => redactEvidence(value, rawEvidence))
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
    ...(error.causeText ? { cause: redactEvidence(error.causeText) } : {}),
    ...(error.fix ? { fix: error.fix } : {}),
    ...(error.docsPath ? { docsUrl: error.docsPath } : {}),
    ...(error.evidence && error.evidence.length > 0 ? { evidence: error.evidence } : {}),
  }
}

export function formatWpError(error: WpError): string {
  return [
    `${error.code}: ${error.message}`,
    error.causeText ? `cause: ${redactEvidence(error.causeText)}` : '',
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

function redactEvidence(value: string, secrets: readonly string[] = []): string {
  const builtin = redactText(value) ?? value
  return secrets
    .filter(Boolean)
    .reduce((current, secret) => current.split(secret).join('[REDACTED]'), builtin)
}
