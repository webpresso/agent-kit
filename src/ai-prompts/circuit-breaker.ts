import type { AgentContribution, DebateOutcome, DebateState } from './persona-debate.js'

export interface CircuitBreakerConfig {
  maxTokensPerDebate: number
  requireHumanReviewFor: Array<DebateOutcome['decision']>
  similarityThreshold: number
  minRoundsForSimilarityCheck: number
}

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  maxTokensPerDebate: 50000,
  requireHumanReviewFor: ['approved', 'rejected'],
  similarityThreshold: 0.85,
  minRoundsForSimilarityCheck: 2,
}

export interface CircuitBreakerState {
  totalTokensUsed: number
  roundSimilarities: number[]
  humanReviewRequired: boolean
  breakerTripped: boolean
  tripReason?: CircuitBreakerTripReason
  trippedAt?: Date
}

export type CircuitBreakerTripReason =
  | 'max_tokens_exceeded'
  | 'hallucination_loop_detected'
  | 'human_review_required'

export function createCircuitBreakerState(): CircuitBreakerState {
  return {
    totalTokensUsed: 0,
    roundSimilarities: [],
    humanReviewRequired: false,
    breakerTripped: false,
  }
}

export function updateTokens(
  state: CircuitBreakerState,
  inputTokens: number,
  outputTokens: number,
  config: CircuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG,
): CircuitBreakerState {
  const newTotal = state.totalTokensUsed + inputTokens + outputTokens

  if (newTotal >= config.maxTokensPerDebate && !state.breakerTripped) {
    return {
      ...state,
      totalTokensUsed: newTotal,
      breakerTripped: true,
      tripReason: 'max_tokens_exceeded',
      trippedAt: new Date(),
    }
  }

  return {
    ...state,
    totalTokensUsed: newTotal,
  }
}

function extractWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length >= 4)
      .map((w) => w.replace(/[^a-z0-9]/g, ''))
      .filter((w) => w.length >= 4),
  )
}

export function calculateSimilarity(text1: string, text2: string): number {
  const words1 = extractWords(text1)
  const words2 = extractWords(text2)

  if (words1.size === 0 && words2.size === 0) return 1
  if (words1.size === 0 || words2.size === 0) return 0

  const intersection = new Set([...words1].filter((x) => words2.has(x)))
  const union = new Set([...words1, ...words2])

  return intersection.size / union.size
}

function getRoundText(contributions: AgentContribution[]): string {
  return contributions.map((c) => c.content).join('\n')
}

export function checkForHallucinationLoop(
  state: DebateState,
  config: CircuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG,
): { detected: boolean; similarity: number } {
  const { rounds } = state

  if (rounds.length < config.minRoundsForSimilarityCheck) {
    return { detected: false, similarity: 0 }
  }

  const currentRound = rounds[rounds.length - 1]
  const previousRound = rounds[rounds.length - 2]

  if (!currentRound || !previousRound) {
    return { detected: false, similarity: 0 }
  }

  const currentText = getRoundText(currentRound.contributions)
  const previousText = getRoundText(previousRound.contributions)
  const similarity = calculateSimilarity(currentText, previousText)

  return {
    detected: similarity >= config.similarityThreshold,
    similarity,
  }
}

export function updateSimilarity(
  state: CircuitBreakerState,
  similarity: number,
  isLoop: boolean,
): CircuitBreakerState {
  const newSimilarities = [...state.roundSimilarities, similarity]

  if (isLoop && !state.breakerTripped) {
    return {
      ...state,
      roundSimilarities: newSimilarities,
      breakerTripped: true,
      tripReason: 'hallucination_loop_detected',
      trippedAt: new Date(),
    }
  }

  return {
    ...state,
    roundSimilarities: newSimilarities,
  }
}

export function requiresHumanReview(
  outcome: DebateOutcome,
  config: CircuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG,
): boolean {
  return config.requireHumanReviewFor.includes(outcome.decision)
}

export function flagForHumanReview(state: CircuitBreakerState): CircuitBreakerState {
  return {
    ...state,
    humanReviewRequired: true,
  }
}

export interface CircuitBreakerCheckResult {
  shouldContinue: boolean
  state: CircuitBreakerState
  message?: string
}

function checkAlreadyTripped(breakerState: CircuitBreakerState): CircuitBreakerCheckResult | null {
  if (breakerState.breakerTripped) {
    return {
      shouldContinue: false,
      state: breakerState,
      message: `Circuit breaker tripped: ${breakerState.tripReason}`,
    }
  }
  return null
}

function checkTokenLimit(
  breakerState: CircuitBreakerState,
  config: CircuitBreakerConfig,
): CircuitBreakerCheckResult | null {
  if (breakerState.totalTokensUsed >= config.maxTokensPerDebate) {
    const newState: CircuitBreakerState = {
      ...breakerState,
      breakerTripped: true,
      tripReason: 'max_tokens_exceeded',
      trippedAt: new Date(),
    }
    return {
      shouldContinue: false,
      state: newState,
      message: `Token limit exceeded: ${breakerState.totalTokensUsed}/${config.maxTokensPerDebate}`,
    }
  }
  return null
}

function checkHallucinationLoopDetection(
  debateState: DebateState,
  breakerState: CircuitBreakerState,
  config: CircuitBreakerConfig,
): CircuitBreakerCheckResult {
  const loopCheck = checkForHallucinationLoop(debateState, config)

  if (loopCheck.detected) {
    const newState: CircuitBreakerState = {
      ...breakerState,
      roundSimilarities: [...breakerState.roundSimilarities, loopCheck.similarity],
      breakerTripped: true,
      tripReason: 'hallucination_loop_detected',
      trippedAt: new Date(),
    }
    return {
      shouldContinue: false,
      state: newState,
      message: `Potential hallucination loop detected: ${Math.round(loopCheck.similarity * 100)}% similarity between rounds`,
    }
  }

  return {
    shouldContinue: true,
    state: {
      ...breakerState,
      roundSimilarities: [...breakerState.roundSimilarities, loopCheck.similarity],
    },
  }
}

export function checkCircuitBreaker(
  debateState: DebateState,
  breakerState: CircuitBreakerState,
  config: CircuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG,
): CircuitBreakerCheckResult {
  const trippedCheck = checkAlreadyTripped(breakerState)
  if (trippedCheck) {
    return trippedCheck
  }

  const tokenCheck = checkTokenLimit(breakerState, config)
  if (tokenCheck) {
    return tokenCheck
  }

  return checkHallucinationLoopDetection(debateState, breakerState, config)
}

export function createCircuitBreakerLog(
  debateId: string,
  state: CircuitBreakerState,
  event: 'check' | 'trip' | 'human_review_flagged',
): Record<string, unknown> {
  return {
    timestamp: new Date().toISOString(),
    level: event === 'trip' ? 'warn' : 'info',
    component: 'circuit-breaker',
    debateId,
    event,
    totalTokensUsed: state.totalTokensUsed,
    roundSimilarities: state.roundSimilarities,
    breakerTripped: state.breakerTripped,
    tripReason: state.tripReason,
    humanReviewRequired: state.humanReviewRequired,
  }
}
