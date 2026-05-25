/**
 * Shared CLI dispatch for `wp rule` and `wp skill` subcommands.
 *
 * Subcommands handled here are kind-agnostic — `new | list | show |
 * deprecate`. Per-kind additions (e.g. `wp skill install`) are implemented
 * in the thin command shims, not here.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import matter from 'gray-matter'

import { loadContent, type ContentKind, type ContentRecord, type ContentSource } from './loader.js'

export type ContentSubcommand = 'new' | 'list' | 'show' | 'deprecate'

export interface DispatchOptions {
  cwd: string
  catalogDir: string
  source?: ContentSource
  status?: 'active' | 'deprecated'
  scope?: string
  title?: string
  reason?: string
  dryRun?: boolean
}

export interface DispatchInput {
  kind: ContentKind
  sub: ContentSubcommand
  args: readonly string[]
  options: DispatchOptions
}

export interface DispatchResult {
  exitCode: number
  stdout: string
  stderr: string
}

const CONSUMER_DIR_BY_KIND: Record<ContentKind, string> = {
  rule: 'agent-rules',
  skill: 'agent-skills',
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function humanizeSlug(slug: string): string {
  return slug
    .split('-')
    .filter((part) => part.length > 0)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(' ')
}

function consumerFilePath(cwd: string, kind: ContentKind, slug: string): string {
  return kind === 'rule'
    ? join(cwd, CONSUMER_DIR_BY_KIND.rule, `${slug}.md`)
    : join(cwd, CONSUMER_DIR_BY_KIND.skill, slug, 'SKILL.md')
}

function buildFrontmatterDoc(
  kind: ContentKind,
  slug: string,
  title: string,
  scope: string,
): string {
  const today = todayIsoDate()
  return [
    '---',
    `type: ${kind}`,
    `slug: ${slug}`,
    `title: ${title}`,
    'status: active',
    `scope: ${scope}`,
    'applies_to:',
    '  - agents',
    `created: '${today}'`,
    `last_reviewed: '${today}'`,
    'related: []',
    '---',
    '',
    `# ${title}`,
    '',
    '<!-- Describe the rule or skill here. -->',
    '',
  ].join('\n')
}

interface HandlerArgs {
  kind: ContentKind
  args: readonly string[]
  options: DispatchOptions
}

async function handleNew(args: HandlerArgs): Promise<DispatchResult> {
  const slug = args.args[0]
  if (!slug) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: `Usage: wp ${args.kind} new <slug> [--title <text>] [--scope <s>]`,
    }
  }

  const title = args.options.title ?? humanizeSlug(slug)
  const scope = args.options.scope ?? 'repo'
  const targetPath = consumerFilePath(args.options.cwd, args.kind, slug)
  const content = buildFrontmatterDoc(args.kind, slug, title, scope)

  if (args.options.dryRun) {
    return { exitCode: 0, stdout: `Would create: ${targetPath}`, stderr: '' }
  }

  try {
    mkdirSync(join(targetPath, '..'), { recursive: true })
    writeFileSync(targetPath, content, { flag: 'wx' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('EEXIST')) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: `File already exists: ${targetPath}`,
      }
    }
    return { exitCode: 1, stdout: '', stderr: message }
  }

  return { exitCode: 0, stdout: `Created: ${targetPath}`, stderr: '' }
}

function loadAll(args: HandlerArgs): readonly ContentRecord[] {
  const result = loadContent({
    catalogDir: args.options.catalogDir,
    consumerRoot: args.options.cwd,
    kinds: [args.kind],
  })
  return result.records
}

function readableFrontmatterTitle(record: ContentRecord): string {
  const fm = record.rawFrontmatter as Record<string, unknown>
  const title = fm['title']
  return typeof title === 'string' ? title : record.slug
}

async function handleList(args: HandlerArgs): Promise<DispatchResult> {
  let records = loadAll(args)
  if (args.options.source) {
    records = records.filter((r) => r.source === args.options.source)
  }

  if (records.length === 0) {
    return { exitCode: 0, stdout: '(no records)', stderr: '' }
  }

  const lines = records.map(
    (r) => `${r.source}\t${r.kind}\t${r.slug}\t${readableFrontmatterTitle(r)}`,
  )
  return { exitCode: 0, stdout: lines.join('\n'), stderr: '' }
}

async function handleShow(args: HandlerArgs): Promise<DispatchResult> {
  const slug = args.args[0]
  if (!slug) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: `Usage: wp ${args.kind} show <slug>`,
    }
  }
  const records = loadAll(args)
  const matches = records.filter((r) => r.slug === slug)
  if (matches.length === 0) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: `${args.kind} not found: ${slug}`,
    }
  }
  // Prefer consumer when both exist.
  const chosen = matches.find((r) => r.source === 'consumer') ?? matches[0]!

  const fm = chosen.rawFrontmatter as Record<string, unknown>
  const fmLines = Object.entries(fm).map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
  const stdout = [
    `# Source: ${chosen.source} (${chosen.filePath})`,
    '---',
    ...fmLines,
    '---',
    '',
    chosen.body,
  ].join('\n')

  return { exitCode: 0, stdout, stderr: '' }
}

async function handleDeprecate(args: HandlerArgs): Promise<DispatchResult> {
  const slug = args.args[0]
  if (!slug) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: `Usage: wp ${args.kind} deprecate <slug> [--reason <text>]`,
    }
  }
  const filePath = consumerFilePath(args.options.cwd, args.kind, slug)
  if (!existsSync(filePath)) {
    return {
      exitCode: 1,
      stdout: '',
      stderr:
        `Cannot deprecate ${args.kind} ${slug}: not found in consumer at ${filePath}. ` +
        `Canonical (catalog) entries are owned by the webpresso package.`,
    }
  }

  const raw = readFileSync(filePath, 'utf8')
  const parsed = matter(raw)
  const data = { ...(parsed.data as Record<string, unknown>) }
  data['status'] = 'deprecated'
  data['deprecation_date'] = todayIsoDate()
  data['last_reviewed'] = todayIsoDate()

  let body = parsed.content
  if (args.options.reason && args.options.reason.length > 0) {
    const note = `\n\n## Deprecation note\n\n${args.options.reason}\n`
    body = `${body.trimEnd()}${note}`
  }

  const next = matter.stringify(body, data)
  writeFileSync(filePath, next)

  return {
    exitCode: 0,
    stdout: `Deprecated ${args.kind} ${slug}: ${filePath}`,
    stderr: '',
  }
}

export async function dispatchContent(input: DispatchInput): Promise<DispatchResult> {
  const handlerArgs: HandlerArgs = {
    kind: input.kind,
    args: input.args,
    options: input.options,
  }
  switch (input.sub) {
    case 'new':
      return handleNew(handlerArgs)
    case 'list':
      return handleList(handlerArgs)
    case 'show':
      return handleShow(handlerArgs)
    case 'deprecate':
      return handleDeprecate(handlerArgs)
    default: {
      const sub: string = input.sub
      return {
        exitCode: 1,
        stdout: '',
        stderr: `Unknown ${input.kind} subcommand: ${sub}. Use one of: new, list, show, deprecate.`,
      }
    }
  }
}
