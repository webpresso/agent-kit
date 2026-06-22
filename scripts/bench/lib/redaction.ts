export type RedactionKind = 'api_key' | 'auth_env_name' | 'local_abs_path' | 'private_transcript'

export interface RedactionFinding {
  readonly artifactPath: string
  readonly kind: RedactionKind
  readonly lineHint: string
  readonly lineNumber: number
}

type PatternEntry = { readonly pattern: RegExp; readonly kind: RedactionKind }

const PATTERNS: readonly PatternEntry[] = [
  { pattern: /sk-[A-Za-z0-9-]{20,}/, kind: 'api_key' },
  { pattern: /ANTHROPIC_API_KEY\s*=/, kind: 'api_key' },
  { pattern: /Bearer [A-Za-z0-9\-._~+/]+=*/i, kind: 'api_key' },
  { pattern: /npm_[A-Za-z0-9]{30,}/, kind: 'api_key' },
  {
    pattern: /(?:GH_PACKAGES_TOKEN|NPM_TOKEN|GITHUB_TOKEN|NODE_AUTH_TOKEN|OPENAI_API_KEY)\s*=/,
    kind: 'auth_env_name',
  },
  { pattern: /\/Users\/[a-zA-Z]/, kind: 'local_abs_path' },
  { pattern: /~\/\.claude/, kind: 'local_abs_path' },
  { pattern: /\/home\/[a-zA-Z]/, kind: 'local_abs_path' },
  { pattern: /\/tmp\/[a-zA-Z]/, kind: 'local_abs_path' },
  { pattern: /\[PRIVATE TRANSCRIPT\]/, kind: 'private_transcript' },
  { pattern: /\[REDACTED\]/, kind: 'private_transcript' },
  { pattern: /^---BEGIN PRIVATE---$/, kind: 'private_transcript' },
]

function isPlaceholderLine(line: string): boolean {
  return line.includes('<absolute-local-path>')
}

export function scanForRedaction(text: string, artifactPath: string): readonly RedactionFinding[] {
  const findings: RedactionFinding[] = []
  const lines = text.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (isPlaceholderLine(line)) continue

    for (const { pattern, kind } of PATTERNS) {
      if (pattern.test(line)) {
        findings.push({
          artifactPath,
          kind,
          lineHint: line.slice(0, 80),
          lineNumber: i + 1,
        })
        break
      }
    }
  }

  return findings
}

export function redactionStatus(
  findings: readonly RedactionFinding[],
): 'clean' | 'needs_redaction' {
  return findings.length === 0 ? 'clean' : 'needs_redaction'
}
