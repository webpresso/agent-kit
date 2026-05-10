import { describe, expect, it } from 'vitest'

import {
  AGENT_PERSONAS,
  BAZIL_PROMPT,
  PERSONA_PROMPTS,
  RACHEL_PROMPT,
  calculateSimilarity,
  createDebateState,
  formatPersonaContext,
  getPersonaContextHeader,
  parseConfidence,
  parsePosition,
} from './index.js'

describe('ai-prompts index', () => {
  it('exports the shared agent personas', () => {
    expect(AGENT_PERSONAS).toEqual(['steve', 'rachel', 'ozby', 'volker', 'jeramy', 'rodrigo'])
  })

  it('exports persona prompt mappings', () => {
    expect(PERSONA_PROMPTS.steve).toBe(BAZIL_PROMPT)
    expect(PERSONA_PROMPTS.rachel).toBe(RACHEL_PROMPT)
  })

  it('formats persona context and headers', () => {
    expect(getPersonaContextHeader('steve')).toBe('# Business Intelligence')
    expect(
      formatPersonaContext('steve', {
        business: {
          mrr: 50000,
          priorities: ['Reduce churn'],
        },
      }),
    ).toContain('Reduce churn')
  })

  it('parses debate inputs and creates state', () => {
    expect(parsePosition('approve')).toBe('approve')
    expect(parseConfidence('85%')).toBe(0.85)

    const state = createDebateState({ type: 'feature_review', topic: 'Ship prompts extraction' })
    expect(state.status).toBe('in_progress')
    expect(state.config.topic).toBe('Ship prompts extraction')
  })

  it('calculates text similarity for circuit-breaker checks', () => {
    expect(
      calculateSimilarity('implement feature review system', 'implement feature testing system'),
    ).toBeCloseTo(0.6, 1)
  })
})
