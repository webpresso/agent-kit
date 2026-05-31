import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const FULL_SHA_PATTERN = /^[a-f0-9]{40}$/i
const DIGEST_PATTERN = /@sha256:[a-f0-9]{64}$/i

interface Violation {
  readonly file: string
  readonly line: number
  readonly ref: string
  readonly reason: string
}

function stripInlineComment(value: string): string {
  return value.replace(/\s+#.*$/u, '').trim()
}

function normalizeUsesValue(raw: string): string {
  const value = stripInlineComment(raw)
  return value.replace(/^['"]|['"]$/gu, '')
}

function validateUsesRef(ref: string): string | null {
  if (ref.startsWith('./')) return null
  if (ref.startsWith('docker://')) {
    return DIGEST_PATTERN.test(ref) ? null : 'Docker actions must be pinned by sha256 digest.'
  }

  const atIndex = ref.lastIndexOf('@')
  if (atIndex === -1) return 'GitHub actions must include an immutable full commit SHA.'

  const version = ref.slice(atIndex + 1)
  if (!FULL_SHA_PATTERN.test(version)) {
    return 'GitHub actions must be pinned to a 40-character commit SHA.'
  }
  return null
}

function scanWorkflow(file: string, root: string): Violation[] {
  const text = readFileSync(file, 'utf8')
  const violations: Violation[] = []
  const lines = text.split('\n')
  for (const [index, line] of lines.entries()) {
    const match = /^\s*(?:-\s*)?uses:\s*(.+?)\s*$/u.exec(line)
    if (!match?.[1]) continue

    const ref = normalizeUsesValue(match[1])
    const reason = validateUsesRef(ref)
    if (!reason) continue

    violations.push({
      file: relative(root, file),
      line: index + 1,
      ref,
      reason,
    })
  }
  return violations
}

function workflowFiles(root: string): string[] {
  const workflowsDir = join(root, '.github', 'workflows')
  if (!existsSync(workflowsDir)) return []
  return readdirSync(workflowsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.ya?ml$/iu.test(entry.name))
    .map((entry) => join(workflowsDir, entry.name))
    .sort()
}

const root = resolve(process.argv[2] ?? process.cwd())
const violations = workflowFiles(root).flatMap((file) => scanWorkflow(file, root))

if (violations.length > 0) {
  for (const violation of violations) {
    process.stderr.write(
      `${violation.file}:${violation.line}: ${violation.reason} Found ${violation.ref}\n`,
    )
  }
  process.exit(1)
}

process.stdout.write('OK: GitHub workflow actions are pinned to immutable refs\n')
