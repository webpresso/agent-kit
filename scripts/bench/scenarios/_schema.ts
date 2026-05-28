import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { z } from 'zod'

export const QrelSchema = z.object({
  question: z.string().min(1),
  expected_substring_in_response: z.string().min(1),
})

export const PromptTurnSchema = z.object({
  session_id: z.string().min(1),
  turn_idx: z.number().int().nonnegative(),
  role: z.enum(['user', 'assistant']),
  text: z.string().min(1),
  estimated_tokens: z.number().int().positive(),
})

export const ScenarioSchema = z.object({
  scenario_id: z.string().min(1),
  version: z.number().int().positive(),
  description: z.string().min(1),
  worst_case_token_count: z.number().int().gte(200_001),
  prompt_turns: z.array(PromptTurnSchema).min(1),
  expected_tool_calls: z.array(z.string().min(1)).min(1),
  qrels: z.array(QrelSchema).min(5),
})

export const ScenarioRecallFileSchema = z.object({
  scenario_id: z.string().min(1),
  qrels: z.array(QrelSchema).min(5),
})

export type Qrel = z.infer<typeof QrelSchema>
export type PromptTurn = z.infer<typeof PromptTurnSchema>
export type Scenario = z.infer<typeof ScenarioSchema>

const scenarioDir = dirname(fileURLToPath(import.meta.url))

export const SCENARIO_DIR = resolve(scenarioDir)
export const QREL_DIR = resolve(scenarioDir, '..', 'qrels')
export const SCENARIO_FILES = [
  resolve(SCENARIO_DIR, 'debug-long-session.json'),
  resolve(SCENARIO_DIR, 'multi-file-refactor.json'),
  resolve(SCENARIO_DIR, 'resumable-task.json'),
] as const
export const DEBUG_QRELS_FILE = resolve(QREL_DIR, 'debug-recall.json')

function parseJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown
}

export function loadScenario(path: string): Scenario {
  return ScenarioSchema.parse(parseJsonFile(path))
}

export function loadAllScenarios(): Scenario[] {
  return SCENARIO_FILES.map((path) => loadScenario(path))
}

export function loadDebugRecallFile(): { scenario_id: string; qrels: Qrel[] } {
  return ScenarioRecallFileSchema.parse(parseJsonFile(DEBUG_QRELS_FILE))
}
