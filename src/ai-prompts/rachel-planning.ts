export type ComponentType = 'database' | 'api' | 'ui' | 'worker' | 'integration'

export type Complexity = 'low' | 'medium' | 'high'

export interface TechComponent {
  type: ComponentType
  name: string
  description: string
  schema?: string
}

export interface TechBreakdown {
  feature: string
  summary: string
  components: TechComponent[]
  dependencies: string[]
  estimatedComplexity: Complexity
  userStory: string
}

export interface ParsedRachelResponse {
  message: string
  breakdown?: TechBreakdown
}

export const RACHEL_PLANNING_PROMPT = `You are Rachel, VP of Product with a technical background.

Your task is to analyze a feature and break it down into technical components.

## Input

You'll receive a feature from a Business Canvas:
- Name: The feature name
- Description: What it does
- Priority: must-have, should-have, nice-to-have
- Complexity: low, medium, high
- Context: Other features in the project

## Output Format

Respond with a brief analysis followed by a structured technical breakdown in XML tags:

<tech_breakdown>
{
  "feature": "Feature Name",
  "summary": "Brief technical approach",
  "components": [
    {
      "type": "database",
      "name": "timesheets",
      "description": "Table for time entries",
      "schema": "id, user_id, client_id, start_time, end_time, duration_minutes"
    },
    {
      "type": "api",
      "name": "POST /time-entries",
      "description": "Create new time entry"
    },
    {
      "type": "api",
      "name": "GET /time-entries",
      "description": "List time entries with filters"
    },
    {
      "type": "ui",
      "name": "TimerComponent",
      "description": "Start/stop timer with live duration"
    }
  ],
  "dependencies": ["Client Workspace"],
  "estimatedComplexity": "medium",
  "userStory": "As a freelancer, I want to track time per client so that I can invoice accurately"
}
</tech_breakdown>

## Component Types

- **database**: Tables, indexes, relationships, migrations
- **api**: REST endpoints or GraphQL operations (queries/mutations)
- **ui**: React components, pages, forms
- **worker**: Background jobs, scheduled tasks, queue handlers
- **integration**: External service connections (Stripe, email, etc.)

## Guidelines

1. **Keep components small and focused** - Each should be a single, testable unit
2. **Identify dependencies** - Note which other features must be implemented first
3. **Consider user journey** - Who uses this feature, when, and why
4. **Include accessibility** - Note any a11y considerations in UI components
5. **Write clear user stories** - Follow "As a [persona], I want [feature] so that [benefit]"
6. **Be practical** - Suggest the simplest solution that meets the requirements

## Complexity Guidelines

- **low**: Single table, simple CRUD, straightforward UI
- **medium**: Multiple tables with relationships, complex queries, interactive UI
- **high**: External integrations, real-time features, complex business logic

Always provide your conversational analysis before the <tech_breakdown> tags.
`

export const RACHEL_FEATURE_PROMPT = `Analyze this feature and provide a technical breakdown:

**Feature**: {feature_name}
**Description**: {feature_description}
**Priority**: {priority}
**Complexity**: {complexity}

**Other features in this project**:
{other_features}

Please provide:
1. A brief analysis of how to approach this feature
2. The technical components needed (database, API, UI, etc.)
3. Dependencies on other features
4. A user story for this feature

Respond with your analysis and the structured tech_breakdown.
`

export function parseRachelBreakdown(response: string): ParsedRachelResponse {
  const breakdownMatch = response.match(/<tech_breakdown>([\s\S]*?)<\/tech_breakdown>/)
  const message = response.replace(/<tech_breakdown>[\s\S]*?<\/tech_breakdown>/g, '').trim()

  let breakdown: TechBreakdown | undefined
  if (breakdownMatch?.[1]) {
    try {
      const parsed = JSON.parse(breakdownMatch[1].trim()) as TechBreakdown
      if (isValidTechBreakdown(parsed)) {
        breakdown = parsed
      } else {
        console.warn('Invalid tech breakdown structure')
      }
    } catch {
      console.warn('Failed to parse tech breakdown JSON')
    }
  }

  return {
    message,
    breakdown,
  }
}

function hasValidTechBreakdownStrings(b: Record<string, unknown>): boolean {
  if (typeof b.feature !== 'string' || !b.feature) {
    return false
  }
  if (typeof b.summary !== 'string' || !b.summary) {
    return false
  }
  if (typeof b.userStory !== 'string' || !b.userStory) {
    return false
  }
  return true
}

function hasValidTechComponents(b: Record<string, unknown>): boolean {
  if (!Array.isArray(b.components)) {
    return false
  }
  for (const comp of b.components) {
    if (!isValidTechComponent(comp)) {
      return false
    }
  }
  return true
}

function hasValidTechDependencies(b: Record<string, unknown>): boolean {
  if (!Array.isArray(b.dependencies)) {
    return false
  }
  for (const dep of b.dependencies) {
    if (typeof dep !== 'string') {
      return false
    }
  }
  return true
}

export function isValidTechBreakdown(breakdown: unknown): breakdown is TechBreakdown {
  if (!breakdown || typeof breakdown !== 'object') {
    return false
  }

  const b = breakdown as Record<string, unknown>

  if (!hasValidTechBreakdownStrings(b)) {
    return false
  }
  if (!['low', 'medium', 'high'].includes(b.estimatedComplexity as string)) {
    return false
  }
  if (!hasValidTechComponents(b)) {
    return false
  }
  if (!hasValidTechDependencies(b)) {
    return false
  }

  return true
}

const VALID_COMPONENT_TYPES: ReadonlySet<string> = new Set([
  'database',
  'api',
  'ui',
  'worker',
  'integration',
])

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isValidTechComponent(component: unknown): component is TechComponent {
  if (!component || typeof component !== 'object') {
    return false
  }

  const c = component as Record<string, unknown>

  if (!VALID_COMPONENT_TYPES.has(c.type as string)) {
    return false
  }
  if (!isNonEmptyString(c.name)) {
    return false
  }
  if (!isNonEmptyString(c.description)) {
    return false
  }
  if (c.schema !== undefined && typeof c.schema !== 'string') {
    return false
  }

  return true
}

export const GRANULARITY_INSTRUCTIONS: Record<number, string> = {
  1: 'Keep the breakdown high-level. One task per major feature. Focus on the main user outcome.',
  2: 'Split into database, API, and UI components only. No sub-tasks within components.',
  3: 'Break down into logical tasks that take 1-2 hours each. Balance between detail and overview.',
  4: 'Create fine-grained tasks of 15-30 minutes each. Include specific implementation details.',
  5: 'Maximum granularity. Each file, function, or test is a separate task. Atomic operations.',
}

export function getRachelPromptForGranularity(granularity: number): string {
  const level = Math.max(1, Math.min(5, Math.round(granularity)))

  return `${RACHEL_PLANNING_PROMPT}

## Granularity Level: ${level}/5

${GRANULARITY_INSTRUCTIONS[level]}

Adjust your breakdown detail accordingly. Higher granularity = more components, lower = fewer.
`
}
