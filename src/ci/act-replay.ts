import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

import { parse, stringify } from 'yaml'

import type { CiActEventName } from './act-runner.js'

export const GENERATED_REPLAY_WORKFLOW_PLACEHOLDER = '[GENERATED_REPLAY_WORKFLOW]'

export interface CiActReplayWorkflow {
  readonly workflowPath: string
  cleanup(): void
}

function normalizeWorkflowOnSection(
  currentOn: unknown,
  eventName: CiActEventName,
): Record<string, unknown> {
  if (typeof currentOn === 'string') {
    return currentOn === eventName ? { [eventName]: {} } : { [eventName]: {} }
  }

  if (Array.isArray(currentOn)) {
    return currentOn.includes(eventName) ? { [eventName]: {} } : { [eventName]: {} }
  }

  if (typeof currentOn === 'object' && currentOn !== null) {
    const currentRecord = currentOn as Record<string, unknown>
    return {
      [eventName]:
        currentRecord[eventName] && typeof currentRecord[eventName] === 'object'
          ? currentRecord[eventName]
          : {},
    }
  }

  return { [eventName]: {} }
}

export function buildReplayWorkflowSource(
  sourceYaml: string,
  options: { readonly workflowPath: string; readonly eventName: CiActEventName },
): string {
  const parsed = parse(sourceYaml)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Replay mode requires ${options.workflowPath} to parse as a workflow object`)
  }

  const workflow = { ...(parsed as Record<string, unknown>) }
  const originalName =
    typeof workflow.name === 'string' && workflow.name.trim().length > 0
      ? workflow.name.trim()
      : basename(options.workflowPath)

  workflow.name = `replay: ${originalName}`
  workflow.on = normalizeWorkflowOnSection(workflow.on, options.eventName)

  return stringify(workflow)
}

export function createReplayWorkflow(options: {
  readonly cwd: string
  readonly workflowPath: string
  readonly eventName: CiActEventName
}): CiActReplayWorkflow {
  const sourcePath = resolve(options.cwd, options.workflowPath)
  const sourceYaml = readFileSync(sourcePath, 'utf8')
  const generatedYaml = buildReplayWorkflowSource(sourceYaml, {
    workflowPath: options.workflowPath,
    eventName: options.eventName,
  })
  const dir = mkdtempSync(join(tmpdir(), 'wp-ci-act-replay-'))
  const workflowPath = join(dir, 'workflow.yml')
  writeFileSync(workflowPath, generatedYaml, 'utf8')
  return {
    workflowPath,
    cleanup() {
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
