export const DEFAULT_DEBATE_CONFIG = {
    maxRounds: 3,
    consensusThreshold: 0.75,
    participants: ['steve', 'rachel', 'ozby', 'volker', 'jeramy', 'rodrigo'],
    useModerator: true,
    moderator: 'steve',
    verbose: false,
};
export const DEBATE_PROMPTS = {
    initialPrompt: (config, persona) => {
        const roleContext = {
            steve: 'As the Business Strategist, evaluate this from a business viability, revenue impact, and strategic alignment perspective.',
            rachel: 'As the Product Visionary, evaluate this from a user experience, accessibility, and product-market fit perspective.',
            ozby: 'As the Engineering Lead, evaluate this from a technical feasibility, code quality, and scalability perspective.',
            volker: 'As the Clean Code Evangelist, evaluate this from a code quality, testability, and maintainability perspective.',
            jeramy: 'As the Backend & Cloud Architect, evaluate this from a scalability, data flow, and infrastructure cost perspective.',
            rodrigo: 'As the Sustainability & Supply Chain CTO, evaluate this from a supply chain complexity, enterprise scalability, and sustainability perspective.',
        };
        return `<debate_context>\n<type>${config.type}</type>\n<topic>${config.topic}</topic>\n${config.context ? `<additional_context>${config.context}</additional_context>` : ''}\n</debate_context>\n\n<instructions>\n${roleContext[persona]}\n\nProvide your initial assessment with:\n1. Your position: approve, reject, needs_clarification, or abstain\n2. Your confidence level (0-100%)\n3. Key points supporting your position\n4. Any concerns or questions for other team members\n\nBe concise but thorough. Remember your unique perspective and background.\n</instructions>\n\n<output_format>\nPosition: [Your position]\nConfidence: [0-100]%\nKey Points:\n- [Point 1]\n- [Point 2]\n...\n\nConcerns:\n- [Concern 1]\n...\n\nQuestions for team:\n- [Question 1]\n...\n</output_format>`;
    },
    followUpPrompt: (config, persona, previousRound) => {
        const otherContributions = previousRound.contributions
            .filter((c) => c.persona !== persona)
            .map((c) => `<${c.persona}_perspective>\n${c.content}\n</${c.persona}_perspective>`)
            .join('\n\n');
        return `<debate_context>\n<type>${config.type}</type>\n<topic>${config.topic}</topic>\n<round>${previousRound.roundNumber + 1}</round>\n</debate_context>\n\n<previous_round>\n${otherContributions}\n</previous_round>\n\n<instructions>\nReview your teammates' perspectives and:\n1. Update your position if their arguments convinced you\n2. Address any concerns raised about your area of expertise\n3. Answer any questions directed at you\n4. Raise any new concerns based on what you've learned\n\nWork towards consensus while maintaining your expert perspective.\n</instructions>\n\n<output_format>\nUpdated Position: [Your position - may be unchanged]\nConfidence: [0-100]%\nResponse to concerns:\n- [Response 1]\n...\n\nUpdated assessment:\n[Your refined view considering others' perspectives]\n</output_format>`;
    },
    moderatorPrompt: (config, state) => {
        const roundSummaries = state.rounds
            .map((r) => `<round_${r.roundNumber}>\n${r.contributions.map((c) => `${c.persona}: ${c.position} (${Math.round((c.confidence ?? 0.5) * 100)}% confidence)`).join('\n')}\n${r.summary ? `Summary: ${r.summary}` : ''}\n</round_${r.roundNumber}>`)
            .join('\n\n');
        return `<debate_summary>\n<type>${config.type}</type>\n<topic>${config.topic}</topic>\n<rounds_completed>${state.rounds.length}</rounds_completed>\n\n${roundSummaries}\n</debate_summary>\n\n<instructions>\nAs the moderator, synthesize the debate and determine the final outcome:\n1. Did the team reach consensus? (>= ${(config.consensusThreshold ?? 0.75) * 100}% agreement)\n2. What is the final decision?\n3. What are the key agreements and disagreements?\n4. What action items should result from this discussion?\n\nIf consensus was not reached, decide whether to:\n- Make a tie-breaking decision based on the strongest arguments\n- Escalate to a human for final decision\n</instructions>\n\n<output_format>\nConsensus Reached: [yes/no]\nFinal Decision: [approved/rejected/needs_more_info/escalate_to_human]\nConfidence: [0-100]%\n\nSummary:\n[2-3 sentence summary of the debate]\n\nAgreements:\n- [Agreement 1]\n...\n\nDisagreements:\n- [Disagreement 1]\n...\n\nAction Items:\n- [Action 1]\n...\n</output_format>`;
    },
};
export function parsePosition(text) {
    const lower = text.toLowerCase().trim();
    if (lower.includes('approve') || lower.includes('yes') || lower.includes('accept')) {
        return 'approve';
    }
    if (lower.includes('reject') || lower.includes('no') || lower.includes('deny')) {
        return 'reject';
    }
    if (lower.includes('clarif') || lower.includes('more info') || lower.includes('question')) {
        return 'needs_clarification';
    }
    return 'abstain';
}
const CONFIDENCE_KEYWORDS = [
    { keywords: ['very high', 'certain'], value: 0.95 },
    { keywords: ['very low', 'uncertain'], value: 0.2 },
    { keywords: ['high'], value: 0.8 },
    { keywords: ['medium', 'moderate'], value: 0.6 },
    { keywords: ['low'], value: 0.4 },
];
function parseWordBasedConfidence(text) {
    const lower = text.toLowerCase();
    for (const { keywords, value } of CONFIDENCE_KEYWORDS) {
        if (keywords.some((kw) => lower.includes(kw))) {
            return value;
        }
    }
    return null;
}
export function parseConfidence(text) {
    const percentMatch = text.match(/(\d+)\s*%/);
    if (percentMatch?.[1]) {
        return Math.min(100, Math.max(0, Number.parseInt(percentMatch[1], 10))) / 100;
    }
    const decimalMatch = text.match(/0?\.\d+/);
    if (decimalMatch) {
        return Math.min(1, Math.max(0, Number.parseFloat(decimalMatch[0])));
    }
    return parseWordBasedConfidence(text) ?? 0.5;
}
export function calculateConsensus(contributions) {
    const votes = contributions
        .map((c) => c.position)
        .filter((p) => p !== undefined);
    const voteCounts = votes.reduce((acc, vote) => {
        acc[vote] = (acc[vote] || 0) + 1;
        return acc;
    }, {});
    const totalVotes = votes.length;
    const maxVotes = Math.max(...Object.values(voteCounts), 0);
    const majorityPosition = (Object.entries(voteCounts).find(([_, count]) => count === maxVotes)?.[0] ?? 'abstain');
    const confidences = contributions
        .map((c) => c.confidence)
        .filter((c) => c !== undefined);
    const averageConfidence = confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0.5;
    return {
        hasConsensus: maxVotes === totalVotes && totalVotes > 0,
        majorityPosition,
        percentAgreement: totalVotes > 0 ? maxVotes / totalVotes : 0,
        averageConfidence,
    };
}
export function generateDebateId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `debate-${timestamp}-${random}`;
}
export function createDebateState(config) {
    return {
        id: generateDebateId(),
        config: {
            ...DEFAULT_DEBATE_CONFIG,
            ...config,
        },
        rounds: [],
        status: 'in_progress',
        startedAt: new Date(),
    };
}
export function addContribution(state, contribution) {
    const currentRound = state.rounds[state.rounds.length - 1];
    if (!currentRound) {
        throw new Error('No active round to add contribution to');
    }
    return {
        ...state,
        rounds: [
            ...state.rounds.slice(0, -1),
            {
                ...currentRound,
                contributions: [...currentRound.contributions, contribution],
            },
        ],
    };
}
export function startNewRound(state, topic) {
    const roundNumber = state.rounds.length + 1;
    return {
        ...state,
        rounds: [
            ...state.rounds,
            {
                roundNumber,
                topic: topic ?? state.config.topic,
                contributions: [],
            },
        ],
    };
}
export function finalizeDebate(state, outcome) {
    return {
        ...state,
        status: outcome.consensusReached
            ? 'consensus_reached'
            : outcome.decision === 'escalate_to_human'
                ? 'escalated'
                : 'max_rounds_exceeded',
        outcome,
        completedAt: new Date(),
    };
}
export function shouldContinueDebate(state) {
    const { config, rounds } = state;
    const max_rounds = config.maxRounds ?? DEFAULT_DEBATE_CONFIG.maxRounds;
    if (rounds.length >= max_rounds) {
        return false;
    }
    const lastRound = rounds[rounds.length - 1];
    if (lastRound && lastRound.contributions.length > 0) {
        const { hasConsensus, averageConfidence } = calculateConsensus(lastRound.contributions);
        const threshold = config.consensusThreshold ?? DEFAULT_DEBATE_CONFIG.consensusThreshold;
        if (hasConsensus && averageConfidence >= threshold) {
            return false;
        }
    }
    return true;
}
//# sourceMappingURL=persona-debate.js.map