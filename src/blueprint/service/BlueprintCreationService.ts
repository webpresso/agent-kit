import type { PlanComplexity } from '#core/schema'
import type { ValidationResult } from '#core/types'

import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { type Blueprint, parseBlueprint } from '#core/parser'
import { scanBlueprintDirectory } from '#service/scanner'
import { resolvePackageAsset } from '#utils/package-assets'

const RESERVED_BLUEPRINT_SLUGS = new Set([
  'draft',
  'planned',
  'parked',
  'in-progress',
  'completed',
  'archived',
])

const DEFAULT_TEMPLATE_PATH = resolvePackageAsset('docs/templates/blueprint.md')

export interface CreateBlueprintDraftInput {
  complexity: PlanComplexity
  goal: string
}

export interface CompiledBlueprintDraft {
  complexity: PlanComplexity
  markdown: string
  outputPath: string
  path: string
  projectRoot: string
  relativeFilePath: string
  slug: string
  status: 'draft'
  title: string
}

export interface CreatedBlueprintDraft extends CompiledBlueprintDraft {
  blueprint: Blueprint
}

export interface BlueprintCreationServiceOptions {
  projectRoot?: string
  now?: () => Date
  templatePath?: string
}

export type CreateBlueprintInput = CreateBlueprintDraftInput
export type BlueprintDraft = CompiledBlueprintDraft
export type CreatedBlueprint = CreatedBlueprintDraft

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0] ?? date.toISOString()
}

function replacePlaceholder(template: string, placeholder: string, value: string): string {
  return template.split(placeholder).join(value)
}

function toPortableRelativePath(projectRoot: string, absolutePath: string): string {
  return path.relative(projectRoot, absolutePath).replaceAll(path.sep, '/')
}

function normalizeGoal(goal: string): string {
  const normalized = goal.trim().replace(/\s+/g, ' ')
  if (normalized.length === 0) {
    throw new Error('Blueprint goal must not be empty or whitespace.')
  }

  return normalized
}

function sentenceCase(value: string): string {
  if (value.length === 0) {
    return value
  }

  return value.slice(0, 1).toUpperCase() + value.slice(1)
}

function deriveSlug(goal: string): string {
  return goal
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

function assertGoalProducesUsableSlug(goal: string, slug: string): void {
  if (slug.length === 0) {
    throw new Error(`Blueprint goal "${goal}" could not be converted into a valid slug.`)
  }

  if (RESERVED_BLUEPRINT_SLUGS.has(slug)) {
    throw new Error(`Blueprint goal "${goal}" resolves to reserved slug "${slug}".`)
  }
}

function prepareTemplate(template: string): string {
  const sanitized = template.replace(/^> \*\*For Claude:\*\*.*(?:\r?\n)?/gm, '')
  const withFrontmatterPlaceholders = sanitized
    .replace(/^complexity:\s*.+$/m, 'complexity: {{complexity}}')
    .replace(/^created:\s*.+$/m, "created: '{{date}}'")
    .replace(/^last_updated:\s*.+$/m, "last_updated: '{{date}}'")

  if (withFrontmatterPlaceholders.includes('## Planning Summary')) {
    return withFrontmatterPlaceholders
  }

  return withFrontmatterPlaceholders.replace(
    /\*\*Goal:\*\*\s*\{\{description\}\}/,
    [
      '**Goal:** {{description}}',
      '',
      '## Planning Summary',
      '',
      '- Goal input: `{{description}}`',
      '- Complexity: `{{complexity}}`',
      '- Draft slug: `{{slug}}`',
      '- Output path: `{{output_path}}`',
      '- Creation command: `wp blueprint new "{{description}}" --complexity {{complexity}}`',
      '- Validation scope: parser compliance before write',
    ].join('\n'),
  )
}

function validateGeneratedDraft(
  markdown: string,
  slug: string,
): ValidationResult & { blueprint?: Blueprint } {
  let blueprint: Blueprint

  try {
    blueprint = parseBlueprint(markdown, slug)
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Generated blueprint failed parser validation.',
      valid: false,
    }
  }

  const missingSections = [
    '## Planning Summary',
    '## Architecture Overview',
    '## Verification Gates',
  ].filter((section) => !markdown.includes(section))

  if (missingSections.length > 0) {
    return {
      error: `Generated blueprint is missing required section(s): ${missingSections.join(', ')}`,
      valid: false,
    }
  }

  if (blueprint.tasks.length === 0) {
    return {
      error: 'Generated blueprint must include at least one executable task.',
      valid: false,
    }
  }

  return {
    blueprint,
    valid: true,
  }
}

export class BlueprintCreationService {
  private readonly now: () => Date

  private readonly projectRoot: string

  private readonly templatePath: string

  constructor(projectRoot: string, options?: BlueprintCreationServiceOptions)
  constructor(options: BlueprintCreationServiceOptions & { projectRoot: string })
  constructor(
    projectRootOrOptions: string | (BlueprintCreationServiceOptions & { projectRoot: string }),
    options: BlueprintCreationServiceOptions = {},
  ) {
    const resolvedProjectRoot =
      typeof projectRootOrOptions === 'string'
        ? projectRootOrOptions
        : projectRootOrOptions.projectRoot
    const resolvedOptions =
      typeof projectRootOrOptions === 'string' ? options : projectRootOrOptions

    this.projectRoot = resolvedProjectRoot
    this.templatePath = resolvedOptions.templatePath ?? DEFAULT_TEMPLATE_PATH
    this.now = resolvedOptions.now ?? (() => new Date())
  }

  async compile(input: CreateBlueprintDraftInput): Promise<CompiledBlueprintDraft> {
    return this.compileDraft(input)
  }

  async compileDraft(input: CreateBlueprintDraftInput): Promise<CompiledBlueprintDraft> {
    const goal = normalizeGoal(input.goal)
    const baseSlug = deriveSlug(goal)
    assertGoalProducesUsableSlug(goal, baseSlug)

    const slug = this.resolveCollisionSafeSlug(baseSlug)
    const title = sentenceCase(goal)
    const outputPath = path.join(
      this.projectRoot,
      'webpresso',
      'blueprints',
      'draft',
      slug,
      '_overview.md',
    )
    const relativeFilePath = toPortableRelativePath(this.projectRoot, outputPath)
    const template = prepareTemplate(await readFile(this.templatePath, 'utf-8'))
    const date = formatDate(this.now())

    const replacements: ReadonlyArray<readonly [string, string]> = [
      ['{{date}}', date],
      ['{{complexity}}', input.complexity],
      ['{{title}}', title],
      ['{{description}}', goal],
      ['{{slug}}', slug],
      ['{{output_path}}', relativeFilePath],
    ]
    const markdown = replacements.reduce(
      (currentTemplate, [placeholder, value]) =>
        replacePlaceholder(currentTemplate, placeholder, value),
      template,
    )

    parseBlueprint(markdown, slug)

    return {
      complexity: input.complexity,
      markdown,
      outputPath,
      path: outputPath,
      projectRoot: this.projectRoot,
      relativeFilePath,
      slug,
      status: 'draft',
      title,
    }
  }

  async create(input: CreateBlueprintDraftInput): Promise<CreatedBlueprintDraft> {
    const draft = await this.compileDraft(input)
    const draftRoot = path.join(this.projectRoot, 'webpresso', 'blueprints', 'draft')
    const finalDir = path.dirname(draft.outputPath)

    await mkdir(draftRoot, { recursive: true })
    await mkdir(path.dirname(finalDir), { recursive: true })

    const tempDir = await mkdtemp(path.join(draftRoot, `${draft.slug}.tmp-`))
    const tempPath = path.join(tempDir, '_overview.md')

    try {
      await writeFile(tempPath, draft.markdown, 'utf-8')

      const writtenMarkdown = await readFile(tempPath, 'utf-8')
      const validation = validateGeneratedDraft(writtenMarkdown, draft.slug)
      if (!validation.valid || !validation.blueprint) {
        throw new Error(validation.error ?? 'Generated blueprint failed validation.')
      }

      await rename(tempDir, finalDir)

      return {
        ...draft,
        blueprint: validation.blueprint,
      }
    } catch (error) {
      await rm(tempDir, { force: true, recursive: true })
      await removeIfEmpty(draftRoot)
      throw error
    }
  }

  private resolveCollisionSafeSlug(baseSlug: string): string {
    const blueprintsRoot = path.join(this.projectRoot, 'webpresso', 'blueprints')
    const existing = new Set(
      scanBlueprintDirectory({
        baseDir: blueprintsRoot,
        includeSpecialFolders: true,
      }).map((entry) => entry.slug.split('/').slice(1).join('/') || entry.slug),
    )

    if (!existing.has(baseSlug) && !blueprintDirectoryExists(blueprintsRoot, baseSlug)) {
      return baseSlug
    }

    let suffix = 2
    while (
      existing.has(`${baseSlug}-${suffix}`) ||
      blueprintDirectoryExists(blueprintsRoot, `${baseSlug}-${suffix}`)
    ) {
      suffix += 1
    }

    return `${baseSlug}-${suffix}`
  }
}

function blueprintDirectoryExists(blueprintsRoot: string, slug: string): boolean {
  return [...RESERVED_BLUEPRINT_SLUGS].some((status) =>
    existsSync(path.join(blueprintsRoot, status, slug)),
  )
}

async function removeIfEmpty(directory: string): Promise<void> {
  try {
    const entries = await readdir(directory)
    if (entries.length === 0) {
      await rm(directory, { force: true, recursive: true })
    }
  } catch {
    // Best-effort cleanup only.
  }
}
