import { execFileSync, spawnSync } from 'node:child_process'
import { validateBlueprintTrust } from './validator.js'
import { parseTrustDossier } from './dossier.js'

export interface PromotionTrustInput {
  repoRoot: string
  file: string
  markdown: string
  now?: Date
}

export function applyPromotionTrustGate(input: PromotionTrustInput): string {
  const head = readHead(input.repoRoot)
  let markdown = upsertReadinessValue(
    input.markdown,
    'verified-at',
    (input.now ?? new Date()).toISOString(),
  )
  markdown = upsertReadinessValue(markdown, 'verified-head', head)
  const parsed = parseTrustDossier(markdown)
  for (const gate of parsed.dossier?.gates ?? []) {
    runPromotionCommand(input.repoRoot, gate.command)
    markdown = updateGateLastResult(
      markdown,
      gate.gate,
      `pass at ${(input.now ?? new Date()).toISOString()}`,
    )
  }
  const validated = validateBlueprintTrust({
    repoRoot: input.repoRoot,
    file: input.file,
    status: 'draft',
    markdown,
    promotionCandidate: true,
  })
  if (!validated.ok)
    throw new Error(
      `Blueprint trust gate failed: ${validated.violations.map((v) => `${v.section}: ${v.message}`).join('; ')}`,
    )
  return markdown
}

function readHead(repoRoot: string): string {
  const testHead = process.env['WP_BLUEPRINT_TRUST_GATE_TEST_HEAD']
  if (process.env['VITEST'] === 'true' && testHead && /^[a-f0-9]{40}$/iu.test(testHead)) {
    return testHead
  }
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    throw new Error('Blueprint trust gate failed: git HEAD is unavailable')
  }
}

export function runPromotionCommand(repoRoot: string, command: string): void {
  const argv = parseAllowedWpCommand(command)
  const result = spawnSync('./bin/wp', argv.slice(1), {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
  })
  if (result.status !== 0)
    throw new Error(
      `Promotion gate failed (${command}): ${(result.stderr || result.stdout || '').slice(0, 500)}`,
    )
}

export function parseAllowedWpCommand(command: string): string[] {
  if (/[|;&`$<>]|\b&&\b|\b\|\|\b/u.test(command) || command.includes('--fix'))
    throw new Error(`Rejected unsafe promotion gate command: ${command}`)
  const argv = command.trim().split(/\s+/u)
  const binary = argv[0]
  if (binary !== 'wp' && binary !== './bin/wp')
    throw new Error(`Promotion gates must use wp facade commands: ${command}`)
  const sub = argv[1]
  if (!['audit', 'test', 'typecheck', 'lint', 'sync'].includes(sub ?? ''))
    throw new Error(`Unsupported promotion gate wp subcommand: ${sub ?? ''}`)
  return ['wp', ...argv.slice(1)]
}

function upsertReadinessValue(markdown: string, key: string, value: string): string {
  const re = new RegExp(`^- ${key}: .*$`, 'mu')
  return re.test(markdown) ? markdown.replace(re, `- ${key}: ${value}`) : markdown
}

function updateGateLastResult(markdown: string, gate: string, result: string): string {
  const lines = markdown.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i]!.trim().startsWith('|')
      ? lines[i]!.slice(1, -1)
          .split('|')
          .map((c) => c.trim())
      : []
    if (cells[0] === gate && cells.length === 4) {
      lines[i] = `| ${cells[0]} | ${cells[1]} | ${cells[2]} | ${result} |`
    }
  }
  return lines.join('\n')
}
