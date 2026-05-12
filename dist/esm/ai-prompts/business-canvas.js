export const BUSINESS_CANVAS_SYSTEM_PROMPT = `You are conducting a business viability analysis conversation.

## Conversation Flow

Guide the user through these phases naturally (don't announce phases):

1. **Problem Discovery** (2-3 questions)
   - What problem are you solving?
   - Who experiences this problem most acutely?
   - How do they currently solve it?

2. **Target Audience Deep Dive** (1-2 questions)
   - Who is the ideal customer persona?
   - What are their specific pain points and demographics?

3. **Market Validation** (2-3 questions)
   - Who are your competitors?
   - What's your target price point?
   - How big is your addressable market?

4. **Differentiation & Success Criteria** (1-2 questions)
   - What makes your solution unique?
   - What metrics will define success for MVP?

5. **Canvas Generation**
   When you have enough information (typically 5-8 exchanges), generate the canvas.

## Output Format

When ready to generate the canvas, include these XML tags in your response:

<business_canvas>
{
  "problem": "Clear problem statement describing the pain point",
  "solution": "Your proposed solution summary",
  "targetAudience": [
    {
      "persona": "Primary user type (e.g., 'Freelance designers')",
      "painPoints": ["Specific pain point 1", "Specific pain point 2"],
      "demographics": "Age, role, industry, etc.",
      "marketSize": "Estimated TAM for this segment"
    }
  ],
  "successMetrics": [
    {
      "name": "MRR",
      "target": "$10K",
      "timeframe": "6 months post-launch"
    },
    {
      "name": "Active Users",
      "target": "500",
      "timeframe": "3 months post-launch"
    }
  ],
  "keyMetrics": ["MRR", "Churn Rate", "DAU"],
  "uniqueValue": "What makes this unique/differentiated",
  "channels": ["ProductHunt", "Twitter", "Content Marketing"],
  "revenueModel": "How you'll make money (e.g., $15/mo subscription)",
  "costStructure": "Estimated monthly costs breakdown",
  "features": [
    {
      "name": "Feature Name",
      "description": "What it does and why it matters",
      "priority": "must-have",
      "complexity": "medium"
    }
  ],
  "marketResearch": {
    "competitors": [
      {
        "name": "Competitor Name",
        "pricing": "$X/mo",
        "strengths": ["Strength 1"],
        "weaknesses": ["Weakness 1"]
      }
    ],
    "trends": ["Market trend 1", "Market trend 2"],
    "gaps": ["Gap in market 1", "Gap in market 2"]
  }
}
</business_canvas>

<viability_decision>GO|NO_GO|NEEDS_MORE_INFO</viability_decision>
<viability_rationale>Why this decision...</viability_rationale>

## Feature Prioritization Rules

When generating features, follow strict MVP prioritization:

- **must-have** (Week 1-2): Core features that validate the hypothesis. Max 3-4 features.
- **should-have** (Week 2-4): Important but not blocking validation. Max 2-3 features.
- **nice-to-have** (Post-MVP): Polish and expansion features.

Complexity estimates:
- **low**: Can be built in < 1 day
- **medium**: 1-3 days of development
- **high**: 3+ days or requires external integrations

## Viability Criteria

- **GO**: Clear problem, addressable market (>$1B TAM), differentiated solution, viable unit economics (LTV:CAC > 3:1)
- **NO_GO**: No clear problem, saturated market with dominant players, no differentiation, unsustainable costs
- **NEEDS_MORE_INFO**: Missing critical information to make a decision (e.g., unknown pricing, unclear target audience)

## Guidelines

- Ask one question at a time (occasionally two if related)
- Challenge assumptions politely but directly
- Use investor terminology naturally (CAC, LTV, Churn, ROI, TAM, SAM)
- Provide insights from market patterns you've seen
- When generating canvas, prioritize features ruthlessly for MVP
- Always include your conversational response before the canvas tags
- Include at least 2 success metrics with realistic targets
- Identify at least 2 competitors in market research
`;
export const BUSINESS_CANVAS_USER_PROMPT = `Continue the conversation to understand this business idea.
If you have enough information (5-8 exchanges), generate the Business Canvas.

Previous conversation:
{conversation_history}

User's latest message:
{user_message}
`;
export function parseBusinessCanvas(response) {
    const canvasMatch = response.match(/<business_canvas>([\s\S]*?)<\/business_canvas>/);
    const viabilityMatch = response.match(/<viability_decision>(\w+)<\/viability_decision>/);
    const rationaleMatch = response.match(/<viability_rationale>([\s\S]*?)<\/viability_rationale>/);
    const message = response
        .replace(/<business_canvas>[\s\S]*?<\/business_canvas>/g, '')
        .replace(/<viability_decision>[\s\S]*?<\/viability_decision>/g, '')
        .replace(/<viability_rationale>[\s\S]*?<\/viability_rationale>/g, '')
        .trim();
    let canvas;
    if (canvasMatch?.[1]) {
        try {
            canvas = JSON.parse(canvasMatch[1].trim());
        }
        catch {
            console.warn('Failed to parse business canvas JSON');
        }
    }
    let viability;
    if (viabilityMatch?.[1]) {
        const decision = viabilityMatch[1].toUpperCase();
        if (decision === 'GO' || decision === 'NO_GO' || decision === 'NEEDS_MORE_INFO') {
            viability = decision;
        }
    }
    const rationale = rationaleMatch?.[1]?.trim();
    return {
        message,
        canvas,
        viability,
        rationale,
    };
}
function isValidTargetAudience(audience) {
    if (!audience || typeof audience !== 'object') {
        return false;
    }
    const a = audience;
    if (typeof a.persona !== 'string' || !a.persona) {
        return false;
    }
    if (!Array.isArray(a.painPoints) || !a.painPoints.length) {
        return false;
    }
    return true;
}
function isValidSuccessMetric(metric) {
    if (!metric || typeof metric !== 'object') {
        return false;
    }
    const m = metric;
    if (typeof m.name !== 'string' || !m.name) {
        return false;
    }
    if (typeof m.target !== 'string' || !m.target) {
        return false;
    }
    if (typeof m.timeframe !== 'string' || !m.timeframe) {
        return false;
    }
    return true;
}
function hasValidCanvasStrings(c) {
    const requiredStrings = [
        'problem',
        'solution',
        'uniqueValue',
        'revenueModel',
        'costStructure',
    ];
    for (const field of requiredStrings) {
        if (typeof c[field] !== 'string' || !c[field]) {
            return false;
        }
    }
    return true;
}
function hasValidCanvasArrays(c) {
    const requiredArrays = [
        'keyMetrics',
        'channels',
        'features',
        'targetAudience',
        'successMetrics',
    ];
    for (const field of requiredArrays) {
        if (!Array.isArray(c[field])) {
            return false;
        }
    }
    return true;
}
function hasValidCanvasAudience(c) {
    const targetAudience = c.targetAudience;
    if (!targetAudience.length) {
        return false;
    }
    for (const audience of targetAudience) {
        if (!isValidTargetAudience(audience)) {
            return false;
        }
    }
    return true;
}
function hasValidCanvasMetrics(c) {
    const successMetrics = c.successMetrics;
    if (!successMetrics.length) {
        return false;
    }
    for (const metric of successMetrics) {
        if (!isValidSuccessMetric(metric)) {
            return false;
        }
    }
    return true;
}
function hasValidCanvasFeatures(c) {
    const features = c.features;
    for (const feature of features) {
        if (!isValidFeatureProposal(feature)) {
            return false;
        }
    }
    return true;
}
export function isValidBusinessCanvas(canvas) {
    if (!canvas || typeof canvas !== 'object') {
        return false;
    }
    const c = canvas;
    if (!hasValidCanvasStrings(c)) {
        return false;
    }
    if (!hasValidCanvasArrays(c)) {
        return false;
    }
    if (!hasValidCanvasAudience(c)) {
        return false;
    }
    if (!hasValidCanvasMetrics(c)) {
        return false;
    }
    if (!hasValidCanvasFeatures(c)) {
        return false;
    }
    return true;
}
function isValidFeatureProposal(feature) {
    if (!feature || typeof feature !== 'object') {
        return false;
    }
    const f = feature;
    if (typeof f.name !== 'string' || !f.name) {
        return false;
    }
    if (typeof f.description !== 'string' || !f.description) {
        return false;
    }
    if (!['must-have', 'should-have', 'nice-to-have'].includes(f.priority)) {
        return false;
    }
    if (!['low', 'medium', 'high'].includes(f.complexity)) {
        return false;
    }
    return true;
}
//# sourceMappingURL=business-canvas.js.map