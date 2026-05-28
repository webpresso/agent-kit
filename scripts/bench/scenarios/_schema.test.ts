import { describe, expect, it } from 'vitest'

import { DEBUG_QRELS_FILE, loadAllScenarios, loadDebugRecallFile, SCENARIO_FILES } from './_schema'

describe('bench scenario schema', () => {
  it('validates all scenario fixtures and their compaction-oriented metadata', () => {
    const scenarios = loadAllScenarios()

    expect(SCENARIO_FILES).toHaveLength(3)
    expect(scenarios).toHaveLength(3)

    for (const scenario of scenarios) {
      expect(scenario.qrels.length).toBeGreaterThanOrEqual(5)
      expect(scenario.worst_case_token_count).toBeGreaterThan(200_000)
      expect(scenario.prompt_turns.length).toBeGreaterThanOrEqual(8)
      expect(new Set(scenario.expected_tool_calls).size).toBe(scenario.expected_tool_calls.length)
    }

    const resumable = scenarios.find((scenario) => scenario.scenario_id === 'resumable-task')
    expect(resumable).toBeDefined()
    expect(new Set(resumable?.prompt_turns.map((turn) => turn.session_id))).toHaveProperty(
      'size',
      2,
    )
  })

  it('keeps the standalone debug recall file in sync with the inline debug scenario qrels', () => {
    const scenarios = loadAllScenarios()
    const debugScenario = scenarios.find(
      (scenario) => scenario.scenario_id === 'debug-long-session',
    )
    const debugRecall = loadDebugRecallFile()

    expect(DEBUG_QRELS_FILE.endsWith('debug-recall.json')).toBe(true)
    expect(debugScenario).toBeDefined()
    expect(debugRecall.scenario_id).toBe('debug-long-session')
    expect(debugRecall.qrels).toStrictEqual(debugScenario?.qrels)
  })
})
