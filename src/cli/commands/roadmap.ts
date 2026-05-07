import type { CAC } from 'cac'

import { buildRoadmapModel } from '#local'
import type { ShowBlueprintResult } from './blueprint/router.js'

import { listBlueprints, showBlueprint } from './blueprint/router.js'
import { formatBlueprintDetails, formatBlueprintSummaries, printBlueprintOutput } from './blueprint/router-output.js'

const ROADMAP_HELP = [
  'ak roadmap',
  '',
  'Commands:',
  '  list [status]',
  '  show <slug>',
].join('\n')

export function getRoadmapHelpText(): string {
  return ROADMAP_HELP
}

export function assertParentRoadmap(result: ShowBlueprintResult): ShowBlueprintResult {
  if (result.blueprint.type !== 'parent-roadmap') {
    throw new Error(
      `Blueprint ${result.slug} is type=${result.blueprint.type}, not type=parent-roadmap. Use 'ak blueprint show ${result.slug}' instead.`,
    )
  }

  return result
}

export function formatRoadmapDetails(
  result: ShowBlueprintResult,
  childResults: readonly ShowBlueprintResult[],
): string {
  const childLines =
    childResults.length > 0
      ? childResults.map(
          (child) =>
            `- ${child.slug} status=${child.blueprint.status} tasks=${child.blueprint.tasks.filter((task) => task.status === 'done').length}/${child.blueprint.tasks.length} done`,
        )
      : ['- No child blueprints declared']

  const blockerLines = childResults.flatMap((child) =>
    child.blueprint.tasks
      .filter((task) => task.status === 'blocked')
      .map((task) => `- ${child.slug} Task ${task.id}: ${task.blockedReason ?? task.title}`),
  )

  return [
    formatBlueprintDetails(result),
    '',
    'children:',
    ...childLines,
    '',
    'blockers:',
    ...(blockerLines.length > 0 ? blockerLines : ['- None']),
  ].join('\n')
}

export function registerRoadmapCommand(cli: CAC): void {
  cli
    .command('roadmap [subcommand] [...args]', 'List or show parent roadmaps')
    .option('--json', 'Emit JSON output')
    .option('--project-root <path>', 'Override the project root')
    .action(
      async (
        subcommand: string | undefined,
        args: string[],
        options: { json?: boolean; projectRoot?: string },
      ) => {
        switch (subcommand) {
          case undefined:
            printBlueprintOutput(ROADMAP_HELP, false)
            return
          case 'list': {
            if (args.length > 1) {
              throw new Error('Usage: ak roadmap list [status]')
            }

            const summaries = await listBlueprints({
              json: options.json,
              onlyRoadmaps: true,
              projectRoot: options.projectRoot,
              status: args[0],
            })
            printBlueprintOutput(
              options.json ? summaries : formatBlueprintSummaries(summaries),
              options.json,
            )
            return
          }
          case 'show': {
            const slug = args[0]
            if (!slug) {
              throw new Error('Usage: ak roadmap show <slug>')
            }

            const result = assertParentRoadmap(
              await showBlueprint(slug, { json: options.json, projectRoot: options.projectRoot }),
            )
            const summaries = await listBlueprints({ projectRoot: options.projectRoot })
            const model = buildRoadmapModel(summaries)
            const roadmapNode = model.roadmaps.find(
              (entry) =>
                entry.roadmap.name === result.slug ||
                entry.roadmap.name === result.blueprint.name ||
                entry.roadmap.name.endsWith(`/${result.slug}`),
            )
            const childResults = []
            for (const child of roadmapNode?.children ?? []) {
              childResults.push(await showBlueprint(child.name, { projectRoot: options.projectRoot }))
            }
            printBlueprintOutput(
              options.json ? { ...result, children: childResults } : formatRoadmapDetails(result, childResults),
              options.json,
            )
            return
          }
          default:
            throw new Error(`Unknown roadmap subcommand: ${subcommand}\n\nUse one of: list, show`)
        }
      },
    )
}
