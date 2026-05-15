export const DEFAULT_CIRCUIT_BREAKER_CONFIG = {
    maxTokensPerDebate: 50000,
    requireHumanReviewFor: ['approved', 'rejected'],
    similarityThreshold: 0.85,
    minRoundsForSimilarityCheck: 2,
};
export function createCircuitBreakerState() {
    return {
        totalTokensUsed: 0,
        roundSimilarities: [],
        humanReviewRequired: false,
        breakerTripped: false,
    };
}
export function updateTokens(state, inputTokens, outputTokens, config = DEFAULT_CIRCUIT_BREAKER_CONFIG) {
    const newTotal = state.totalTokensUsed + inputTokens + outputTokens;
    if (newTotal >= config.maxTokensPerDebate && !state.breakerTripped) {
        return {
            ...state,
            totalTokensUsed: newTotal,
            breakerTripped: true,
            tripReason: 'max_tokens_exceeded',
            trippedAt: new Date(),
        };
    }
    return {
        ...state,
        totalTokensUsed: newTotal,
    };
}
function extractWords(text) {
    return new Set(text
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length >= 4)
        .map((w) => w.replace(/[^a-z0-9]/g, ''))
        .filter((w) => w.length >= 4));
}
export function calculateSimilarity(text1, text2) {
    const words1 = extractWords(text1);
    const words2 = extractWords(text2);
    if (words1.size === 0 && words2.size === 0)
        return 1;
    if (words1.size === 0 || words2.size === 0)
        return 0;
    const intersection = new Set([...words1].filter((x) => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    return intersection.size / union.size;
}
function getRoundText(contributions) {
    return contributions.map((c) => c.content).join('\n');
}
export function checkForHallucinationLoop(state, config = DEFAULT_CIRCUIT_BREAKER_CONFIG) {
    const { rounds } = state;
    if (rounds.length < config.minRoundsForSimilarityCheck) {
        return { detected: false, similarity: 0 };
    }
    const currentRound = rounds[rounds.length - 1];
    const previousRound = rounds[rounds.length - 2];
    if (!currentRound || !previousRound) {
        return { detected: false, similarity: 0 };
    }
    const currentText = getRoundText(currentRound.contributions);
    const previousText = getRoundText(previousRound.contributions);
    const similarity = calculateSimilarity(currentText, previousText);
    return {
        detected: similarity >= config.similarityThreshold,
        similarity,
    };
}
export function updateSimilarity(state, similarity, isLoop) {
    const newSimilarities = [...state.roundSimilarities, similarity];
    if (isLoop && !state.breakerTripped) {
        return {
            ...state,
            roundSimilarities: newSimilarities,
            breakerTripped: true,
            tripReason: 'hallucination_loop_detected',
            trippedAt: new Date(),
        };
    }
    return {
        ...state,
        roundSimilarities: newSimilarities,
    };
}
export function requiresHumanReview(outcome, config = DEFAULT_CIRCUIT_BREAKER_CONFIG) {
    return config.requireHumanReviewFor.includes(outcome.decision);
}
export function flagForHumanReview(state) {
    return {
        ...state,
        humanReviewRequired: true,
    };
}
function checkAlreadyTripped(breakerState) {
    if (breakerState.breakerTripped) {
        return {
            shouldContinue: false,
            state: breakerState,
            message: `Circuit breaker tripped: ${breakerState.tripReason}`,
        };
    }
    return null;
}
function checkTokenLimit(breakerState, config) {
    if (breakerState.totalTokensUsed >= config.maxTokensPerDebate) {
        const newState = {
            ...breakerState,
            breakerTripped: true,
            tripReason: 'max_tokens_exceeded',
            trippedAt: new Date(),
        };
        return {
            shouldContinue: false,
            state: newState,
            message: `Token limit exceeded: ${breakerState.totalTokensUsed}/${config.maxTokensPerDebate}`,
        };
    }
    return null;
}
function checkHallucinationLoopDetection(debateState, breakerState, config) {
    const loopCheck = checkForHallucinationLoop(debateState, config);
    if (loopCheck.detected) {
        const newState = {
            ...breakerState,
            roundSimilarities: [...breakerState.roundSimilarities, loopCheck.similarity],
            breakerTripped: true,
            tripReason: 'hallucination_loop_detected',
            trippedAt: new Date(),
        };
        return {
            shouldContinue: false,
            state: newState,
            message: `Potential hallucination loop detected: ${Math.round(loopCheck.similarity * 100)}% similarity between rounds`,
        };
    }
    return {
        shouldContinue: true,
        state: {
            ...breakerState,
            roundSimilarities: [...breakerState.roundSimilarities, loopCheck.similarity],
        },
    };
}
export function checkCircuitBreaker(debateState, breakerState, config = DEFAULT_CIRCUIT_BREAKER_CONFIG) {
    const trippedCheck = checkAlreadyTripped(breakerState);
    if (trippedCheck) {
        return trippedCheck;
    }
    const tokenCheck = checkTokenLimit(breakerState, config);
    if (tokenCheck) {
        return tokenCheck;
    }
    return checkHallucinationLoopDetection(debateState, breakerState, config);
}
export function createCircuitBreakerLog(debateId, state, event) {
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
    };
}
//# sourceMappingURL=circuit-breaker.js.map