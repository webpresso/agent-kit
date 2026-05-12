import type { BlueprintAuditResult, BlueprintSummary } from '#local'
import type { BlueprintTemplateEntry } from '#sync/types.js'
import type {
  AdvanceTaskResult,
  BlueprintCommandOptions,
  BlueprintLifecycleMutationResult,
  CreateBlueprintResult,
  ExportBlueprintResult,
  ExecuteBlueprintResult,
  MoveBlueprintResult,
  PromoteBlueprintResult,
  ShowBlueprintResult,
} from './router.js'

import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

import { executeBlueprintDbSubcommand } from './db-commands.js'
import { listTemplates, resolveTemplate } from './template-resolver.js'

// ---------------------------------------------------------------------------
// Platform template fetcher (injectable for tests)
// ---------------------------------------------------------------------------

/**
 * Module-level override. `null` = use the production default (lazy-import
 * BlueprintSyncClient + loadSyncCredentials so this module never statically
 * depends on the HTTP client).
 *
 * @internal
 */
let _platformTemplatesFetcher: (() => Promise<readonly BlueprintTemplateEntry[]>) | null = null

/**
 * Override the platform template fetcher — for tests only.
 * Pass `null` to restore the production default.
 *
 * @internal
 */
export function _setPlatformTemplatesFetcher(
  fetcher: (() => Promise<readonly BlueprintTemplateEntry[]>) | null,
): void {
  _platformTemplatesFetcher = fetcher
}

/**
 * Fetch platform templates using injected fetcher or production default.
 *
 * Returns an empty array when:
 *  - platform is disabled / no credentials
 *  - network is unavailable
 *  - injected fetcher throws
 *
 * Never throws.
 */
async function fetchPlatformTemplates(): Promise<readonly BlueprintTemplateEntry[]> {
  if (_platformTemplatesFetcher !== null) {
    return _platformTemplatesFetcher().catch(() => [])
  }

  // Production path: lazy-import to avoid static dep on HTTP client
  try {
    const { loadSyncCredentials } = await import('#sync/auth.js')
    const creds = loadSyncCredentials()
    if (creds === null) return []

    const { BlueprintSyncClient } = await import('#sync/client.js')
    const client = new BlueprintSyncClient(creds)
    return await client.listTemplates()
  } catch {
    return []
  }
}

/**
 * Merge platform + local template names, platform names first.
 * Local templates with the same name take precedence (dedup by name).
 */
function mergeTemplateNames(
  platform: readonly BlueprintTemplateEntry[],
  local: readonly { name: string; path: string }[],
): readonly string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const t of platform) {
    if (!seen.has(t.name)) {
      seen.add(t.name)
      result.push(t.name)
    }
  }

  for (const t of local) {
    if (!seen.has(t.name)) {
      seen.add(t.name)
      result.push(t.name)
    }
  }

  return result
}

/**
 * Fetch a platform template's markdown content from `url` and write it to a
 * temporary file. Returns the absolute path to the temp file.
 *
 * Throws if the network request fails or returns a non-ok status.
 */
async function fetchPlatformTemplateToTmpFile(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `Failed to fetch platform template from ${url}: HTTP ${response.status}`,
    )
  }
  const content = await response.text()
  const tmpDir = path.join(tmpdir(), 'ak-templates')
  mkdirSync(tmpDir, { recursive: true })
  const tmpFile = path.join(tmpDir, `${randomUUID()}.md`)
  writeFileSync(tmpFile, content, 'utf8')
  return tmpFile
}

/**
 * Thrown by `executeBlueprintSubcommand` when `audit` finds issues and
 * the caller should exit with a non-zero code.  Keeps `process.exit` out
 * of the dispatch layer so tests can assert on it without spawning a
 * subprocess.
 */
export class BlueprintAuditFailedError extends Error {
  constructor(readonly result: BlueprintAuditResult) {
    super('Blueprint audit failed.')
    this.name = 'BlueprintAuditFailedError'
  }
}

interface BlueprintCommandDependencies {
  advanceBlueprintTask: (
    slug: string,
    taskId: string,
    toStatus: string,
    options: BlueprintCommandOptions,
  ) => Promise<AdvanceTaskResult>
  auditBlueprints: (options: BlueprintCommandOptions) => Promise<BlueprintAuditResult>
  controlBlueprintExec: (
    action: 'status' | 'resume' | 'stop',
    slug: string,
    options: BlueprintCommandOptions,
  ) => Promise<ExecuteBlueprintResult>
  readBlueprintExecutionLogs: (
    slug: string,
    options: BlueprintCommandOptions,
  ) => Promise<ExecuteBlueprintResult>
  createBlueprint: (
    goal: string,
    options: BlueprintCommandOptions,
  ) => Promise<CreateBlueprintResult>
  executeBlueprint: (
    slug: string,
    options: BlueprintCommandOptions,
  ) => Promise<ExecuteBlueprintResult>
  parkBlueprint: (
    slug: string,
    options: BlueprintCommandOptions,
  ) => Promise<BlueprintLifecycleMutationResult>
  finalizeBlueprint: (
    slug: string,
    options: BlueprintCommandOptions,
  ) => Promise<BlueprintLifecycleMutationResult>
  finalizeBlueprintBySlug: (
    slug: string,
    options: BlueprintCommandOptions,
  ) => Promise<PromoteBlueprintResult>
  promoteBlueprintToState: (
    slug: string,
    toState: string,
    options: BlueprintCommandOptions,
  ) => Promise<PromoteBlueprintResult>
  formatBlueprintAudit: (result: BlueprintAuditResult) => string
  formatBlueprintCreation: (result: CreateBlueprintResult) => string
  formatBlueprintDetails: (result: ShowBlueprintResult) => string
  formatBlueprintExecution: (result: ExecuteBlueprintResult) => string
  formatBlueprintSummaries: (summaries: BlueprintSummary[]) => string
  getHelpText: () => string
  listBlueprints: (options: BlueprintCommandOptions) => Promise<BlueprintSummary[]>
  moveBlueprint: (
    slug: string,
    status: string,
    options: BlueprintCommandOptions,
  ) => Promise<MoveBlueprintResult>
  mutateBlueprintTask: (
    action: 'start' | 'block' | 'unblock' | 'complete',
    slug: string,
    taskId: string,
    options: BlueprintCommandOptions & { reason?: string },
  ) => Promise<BlueprintLifecycleMutationResult>
  exportBlueprint: (
    slug: string,
    format: string,
    options: BlueprintCommandOptions,
  ) => Promise<ExportBlueprintResult>
  printBlueprintOutput: (value: object | string, asJson?: boolean) => void
  showBlueprint: (slug: string, options: BlueprintCommandOptions) => Promise<ShowBlueprintResult>
  startBlueprint: (
    slug: string,
    options: BlueprintCommandOptions,
  ) => Promise<BlueprintLifecycleMutationResult>
}

export async function executeBlueprintSubcommand(
  subcommand: string | undefined,
  args: string[],
  options: BlueprintCommandOptions,
  deps: BlueprintCommandDependencies,
): Promise<void> {
  switch (subcommand) {
    case undefined: {
      deps.printBlueprintOutput(deps.getHelpText(), false)
      return
    }
    case 'list': {
      if (args.length > 1) {
        throw new Error('Usage: ak blueprint list [status]')
      }

      const summaries = await deps.listBlueprints({
        ...options,
        status: args[0],
      })
      deps.printBlueprintOutput(
        options.json ? summaries : deps.formatBlueprintSummaries(summaries),
        options.json,
      )
      return
    }
    case 'new': {
      // ak blueprint new --list-templates
      if (options.listTemplates) {
        const platformTemplates = await fetchPlatformTemplates()
        const localTemplates = listTemplates(options.templatesDir)
        const merged = mergeTemplateNames(platformTemplates, localTemplates)
        if (merged.length === 0) {
          deps.printBlueprintOutput('No templates found.', false)
        } else {
          deps.printBlueprintOutput(merged.join('\n'), false)
        }
        return
      }

      const goal = args.join(' ').trim()
      if (!goal) {
        throw new Error('Usage: ak blueprint new "<goal>" --complexity <XS|S|M|L|XL>')
      }

      // ak blueprint new --template <name> "<goal>"
      const templateName = options.template
      if (templateName !== undefined) {
        const platformTemplates = await fetchPlatformTemplates()
        const platformMatch = platformTemplates.find((t) => t.name === templateName)

        if (platformMatch !== undefined) {
          const templatePath = await fetchPlatformTemplateToTmpFile(platformMatch.url)
          const result = await deps.createBlueprint(goal, { ...options, templatePath })
          deps.printBlueprintOutput(
            options.json ? result : deps.formatBlueprintCreation(result),
            options.json,
          )
          return
        }

        const resolvedPath = resolveTemplate(templateName, options.templatesDir)
        if (resolvedPath === null) {
          const localTemplates = listTemplates(options.templatesDir)
          const allNames = mergeTemplateNames(platformTemplates, localTemplates)
          const availableList = allNames.length > 0 ? allNames.join(', ') : '(none)'
          deps.printBlueprintOutput(
            `Unknown template: "${templateName}". Available templates: ${availableList}`,
            false,
          )
          process.exit(2)
          return
        }
        const result = await deps.createBlueprint(goal, { ...options, templatePath: resolvedPath })
        deps.printBlueprintOutput(
          options.json ? result : deps.formatBlueprintCreation(result),
          options.json,
        )
        return
      }

      const result = await deps.createBlueprint(goal, options)
      deps.printBlueprintOutput(
        options.json ? result : deps.formatBlueprintCreation(result),
        options.json,
      )
      return
    }
    case 'show': {
      const slug = args[0]
      if (!slug) {
        throw new Error('Usage: ak blueprint show <slug>')
      }

      const result = await deps.showBlueprint(slug, options)
      deps.printBlueprintOutput(
        options.json ? result : deps.formatBlueprintDetails(result),
        options.json,
      )
      return
    }
    case 'exec': {
      const subaction = args[0]
      if (!subaction) {
        throw new Error('Usage: ak blueprint exec <slug>')
      }

      const isControlAction = ['status', 'resume', 'stop', 'logs'].includes(subaction)
      const slug = isControlAction ? args[1] : subaction
      if (!slug) {
        throw new Error(
          isControlAction
            ? `Usage: ak blueprint exec ${subaction} <slug>`
            : 'Usage: ak blueprint exec <slug>',
        )
      }

      const result = !isControlAction
        ? await deps.executeBlueprint(slug, options)
        : subaction === 'logs'
          ? await deps.readBlueprintExecutionLogs(slug, options)
          : await deps.controlBlueprintExec(
              subaction as 'status' | 'resume' | 'stop',
              slug,
              options,
            )
      deps.printBlueprintOutput(
        options.json ? result : deps.formatBlueprintExecution(result),
        options.json,
      )
      return
    }
    case 'control': {
      // `ak blueprint control <status|resume|stop> <slug>` — explicit alias
      // for common exec-control actions. Kept alongside `exec <action> <slug>`
      // for discoverability.
      const action = args[0]
      const slug = args[1]
      if (!action || !slug) {
        throw new Error('Usage: ak blueprint control <status|resume|stop> <slug>')
      }
      if (!['status', 'resume', 'stop'].includes(action)) {
        throw new Error(
          `Unknown blueprint control action: ${action}\n\nUse one of: status, resume, stop`,
        )
      }
      const result = await deps.controlBlueprintExec(
        action as 'status' | 'resume' | 'stop',
        slug,
        options,
      )
      deps.printBlueprintOutput(
        options.json ? result : deps.formatBlueprintExecution(result),
        options.json,
      )
      return
    }
    case 'logs': {
      const slug = args[0]
      if (!slug) {
        throw new Error('Usage: ak blueprint logs <slug>')
      }
      const result = await deps.readBlueprintExecutionLogs(slug, options)
      deps.printBlueprintOutput(
        options.json ? result : deps.formatBlueprintExecution(result),
        options.json,
      )
      return
    }
    case 'move': {
      const slug = args[0]
      const status = args[1]
      if (!slug || !status) {
        throw new Error('Usage: ak blueprint move <slug> <status>')
      }

      const result = await deps.moveBlueprint(slug, status, options)
      deps.printBlueprintOutput(options.json ? result : result.message, options.json)
      return
    }
    case 'start': {
      const slug = args[0]
      if (!slug) {
        throw new Error('Usage: ak blueprint start <slug>')
      }
      const result = await deps.startBlueprint(slug, options)
      deps.printBlueprintOutput(options.json ? result : result.message, options.json)
      return
    }
    case 'park': {
      const slug = args[0]
      if (!slug) {
        throw new Error('Usage: ak blueprint park <slug>')
      }
      const result = await deps.parkBlueprint(slug, options)
      deps.printBlueprintOutput(options.json ? result : result.message, options.json)
      return
    }
    case 'finalize': {
      const slug = args[0]
      if (!slug) {
        throw new Error('Usage: ak blueprint finalize <slug>')
      }
      // Use the DB-backed mutation finalizer if available; fall through to lifecycle engine
      const result = await deps.finalizeBlueprintBySlug(slug, options)
      deps.printBlueprintOutput(options.json ? result : result.message, options.json)
      return
    }
    case 'promote': {
      // ak blueprint promote <slug> <to-state>
      const slug = args[0]
      const toState = args[1]
      if (!slug || !toState) {
        throw new Error('Usage: ak blueprint promote <slug> <planned|in-progress|completed|parked>')
      }
      const result = await deps.promoteBlueprintToState(slug, toState, options)
      deps.printBlueprintOutput(options.json ? result : result.message, options.json)
      return
    }
    case 'audit': {
      const result = await deps.auditBlueprints(options)
      deps.printBlueprintOutput(
        options.json ? result : deps.formatBlueprintAudit(result),
        options.json,
      )
      if (!result.ok) {
        throw new BlueprintAuditFailedError(result)
      }
      return
    }
    case 'task': {
      const first = args[0]

      // Handle: ak blueprint task advance <slug> <taskId> --to <status>
      if (first === 'advance') {
        const slug = args[1]
        const taskId = args[2]
        const toStatus = options.to
        if (!slug || !taskId || !toStatus) {
          throw new Error(
            'Usage: ak blueprint task advance <slug> <task-id> --to <todo|in-progress|blocked|done|dropped>',
          )
        }
        const result = await deps.advanceBlueprintTask(slug, taskId, toStatus, options)
        deps.printBlueprintOutput(options.json ? result : result.message, options.json)
        return
      }

      // Two legacy usage forms:
      //   ak blueprint task <action> <slug> <taskId>               (wp-compatible)
      //   ak blueprint task <slug> <taskId> <action> [--reason X]  (ak-native, per spec)
      const second = args[1]
      const third = args[2]
      if (!first || !second || !third) {
        throw new Error(
          'Usage: ak blueprint task advance <slug> <task-id> --to <status>\n' +
          '       ak blueprint task <slug> <taskId> <start|complete|unblock|block --reason <x>>',
        )
      }
      const ACTIONS = ['start', 'block', 'unblock', 'complete'] as const
      type Action = (typeof ACTIONS)[number]
      const isAction = (value: string): value is Action =>
        (ACTIONS as readonly string[]).includes(value)

      let action: Action
      let slug: string
      let taskId: string
      if (isAction(first)) {
        action = first
        slug = second
        taskId = third
      } else if (isAction(third)) {
        slug = first
        taskId = second
        action = third
      } else {
        throw new Error(`Unknown blueprint task action. Use one of: advance, ${ACTIONS.join(', ')}`)
      }

      const result = await deps.mutateBlueprintTask(action, slug, taskId, {
        ...options,
        reason: options.reason,
      })
      deps.printBlueprintOutput(options.json ? result : result.message, options.json)
      return
    }
    case 'db': {
      const verb = args[0]
      const verbArgs = args.slice(1)
      await executeBlueprintDbSubcommand(
        verb,
        verbArgs,
        {
          params: (options as BlueprintCommandOptions & { params?: string }).params,
          projectRoot: options.projectRoot,
          json: options.json,
        },
        deps.printBlueprintOutput,
      )
      return
    }
    case 'export': {
      const format = options['format'] as string | undefined
      const slug = args[0]
      if (!format || !slug) {
        throw new Error('Usage: ak blueprint export --format spec-kit <slug>')
      }
      if (format !== 'spec-kit') {
        throw new Error(`Unknown export format: ${format}. Supported formats: spec-kit`)
      }
      const result = await deps.exportBlueprint(slug, format, options)
      deps.printBlueprintOutput(options.json ? result : result.message, options.json)
      return
    }
    default: {
      throw new Error(
        `Unknown blueprint subcommand: ${subcommand}\n\nUse one of: list, new, show, exec, start, park, task, finalize, promote, audit, move, control, logs, db, export`,
      )
    }
  }
}
