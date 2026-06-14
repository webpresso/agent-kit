import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { z } from 'zod'

export const QrelLabelerSchema = z.object({
  identity: z.string().min(1),
  role: z.string().min(1),
  timestamp: z.string().datetime(),
})

export const QrelProvenanceSchema = z.object({
  scenario_id: z.string().min(1),
  qrel_id: z.string().min(1),
  source_file: z.string().min(1),
  source_span: z.string().min(1),
  source_hash: z.string().regex(/^[0-9a-f]{64}$/i),
  query_id: z.string().min(1),
  expected_evidence_text: z.string().min(1),
  expected_evidence_hash: z.string().regex(/^[0-9a-f]{64}$/i),
  relevance_criterion_version: z.string().min(1),
  relevance_criterion: z.string().min(1),
  primary_labeler: QrelLabelerSchema,
  independent_reviewer: QrelLabelerSchema,
  label_status: z.enum(['accepted', 'rejected', 'adjudicated']),
  provenance_version: z.number().int().positive(),
})

export const QrelSchema = z.object({
  qrel_id: z.string().min(1),
  question: z.string().min(1),
  expected_substring_in_response: z.string().min(1),
  provenance: QrelProvenanceSchema,
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

export function hashQrelEvidence(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function resolveSourceSpanText(scenario: Scenario, sourceSpan: string): string {
  const match = /^prompt_turns\[(\d+)\]\.text$/.exec(sourceSpan)
  if (!match) {
    throw new Error(`Unsupported qrel source_span: ${sourceSpan}`)
  }

  const turnIdx = Number(match[1])
  const turn = scenario.prompt_turns.find((candidate) => candidate.turn_idx === turnIdx)
  if (!turn) {
    throw new Error(`Missing qrel source turn ${turnIdx} for ${scenario.scenario_id}`)
  }
  return turn.text
}

export function validateScenarioQrelProvenance(scenario: Scenario): void {
  for (const qrel of scenario.qrels) {
    const provenance = qrel.provenance
    if (provenance.scenario_id !== scenario.scenario_id) {
      throw new Error(`${qrel.qrel_id} provenance scenario_id mismatch`)
    }
    if (provenance.qrel_id !== qrel.qrel_id) {
      throw new Error(`${qrel.qrel_id} provenance qrel_id mismatch`)
    }
    if (provenance.query_id.length === 0 || provenance.relevance_criterion.length === 0) {
      throw new Error(`${qrel.qrel_id} missing labeling-process fields`)
    }
    if (provenance.primary_labeler.identity === provenance.independent_reviewer.identity) {
      throw new Error(`${qrel.qrel_id} independent reviewer must differ from primary labeler`)
    }
    if (provenance.expected_evidence_text !== qrel.expected_substring_in_response) {
      throw new Error(`${qrel.qrel_id} expected evidence text mismatch`)
    }
    if (provenance.expected_evidence_hash !== hashQrelEvidence(provenance.expected_evidence_text)) {
      throw new Error(`${qrel.qrel_id} expected evidence hash mismatch`)
    }

    const sourceText = resolveSourceSpanText(scenario, provenance.source_span)
    if (provenance.source_hash !== hashQrelEvidence(sourceText)) {
      throw new Error(`${qrel.qrel_id} source hash mismatch`)
    }
  }
}
