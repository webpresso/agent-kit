import type { AgentPersona } from './types.js'

import { match } from 'ts-pattern'

export interface BusinessContext {
  mrr?: number
  arr?: number
  mau?: number
  dau?: number
  cac?: number
  ltv?: number
  churnRate?: number
  conversionRate?: number
  growth?: {
    mrrGrowth?: number
    userGrowth?: number
    period?: string
  }
  competitors?: string[]
  priorities?: string[]
}

export interface ProductContext {
  nps?: number
  csat?: number
  feedbackThemes?: Array<{
    theme: string
    count: number
    sentiment: 'positive' | 'neutral' | 'negative'
  }>
  featureRequests?: Array<{
    title: string
    votes: number
    status: 'open' | 'planned' | 'in_progress' | 'completed'
  }>
  funnelMetrics?: Array<{
    step: string
    dropOffRate: number
  }>
  accessibilityScore?: number
  supportThemes?: string[]
  userPersonas?: string[]
}

export interface EngineeringContext {
  testCoverage?: number
  lintErrors?: number
  typeErrors?: number
  techDebt?: Array<{
    description: string
    severity: 'low' | 'medium' | 'high' | 'critical'
    file?: string
  }>
  vulnerabilities?: Array<{
    package: string
    severity: 'low' | 'medium' | 'high' | 'critical'
    fixAvailable: boolean
  }>
  errorRate?: number
  performance?: {
    p50Latency?: number
    p95Latency?: number
    p99Latency?: number
  }
  buildStatus?: 'passing' | 'failing' | 'unknown'
  openPRs?: number
}

export interface PersonaContext {
  business?: BusinessContext
  product?: ProductContext
  engineering?: EngineeringContext
}

function addBusinessGrowthMetrics(lines: string[], growth: BusinessContext['growth']): void {
  if (!growth) return

  lines.push('Growth:')
  if (growth.mrrGrowth !== undefined) lines.push(`  - MRR Growth: ${growth.mrrGrowth}%`)
  if (growth.userGrowth !== undefined) lines.push(`  - User Growth: ${growth.userGrowth}%`)
  if (growth.period) lines.push(`  - Period: ${growth.period}`)
}

function addBusinessMetrics(lines: string[], ctx: BusinessContext): void {
  if (ctx.mrr !== undefined) lines.push(`MRR: $${ctx.mrr.toLocaleString()}`)
  if (ctx.arr !== undefined) lines.push(`ARR: $${ctx.arr.toLocaleString()}`)
  if (ctx.mau !== undefined) lines.push(`MAU: ${ctx.mau.toLocaleString()}`)
  if (ctx.dau !== undefined) lines.push(`DAU: ${ctx.dau.toLocaleString()}`)
  if (ctx.cac !== undefined) lines.push(`CAC: $${ctx.cac}`)
  if (ctx.ltv !== undefined) lines.push(`LTV: $${ctx.ltv}`)
  if (ctx.churnRate !== undefined) lines.push(`Churn Rate: ${ctx.churnRate}%`)
  if (ctx.conversionRate !== undefined) lines.push(`Conversion Rate: ${ctx.conversionRate}%`)
}

function addBusinessPriorities(lines: string[], priorities: string[] | undefined): void {
  if (!priorities?.length) return

  lines.push('Strategic Priorities:')
  for (const priority of priorities) {
    lines.push(`  - ${priority}`)
  }
}

function formatBusinessContext(ctx: BusinessContext): string {
  const lines: string[] = ['<business_context>']

  addBusinessMetrics(lines, ctx)
  addBusinessGrowthMetrics(lines, ctx.growth)

  if (ctx.competitors?.length) {
    lines.push(`Competitors: ${ctx.competitors.join(', ')}`)
  }

  addBusinessPriorities(lines, ctx.priorities)

  lines.push('</business_context>')
  return lines.join('\n')
}

function addFeedbackThemes(
  lines: string[],
  feedbackThemes: ProductContext['feedbackThemes'],
): void {
  if (!feedbackThemes?.length) return

  lines.push('User Feedback Themes:')
  for (const theme of feedbackThemes) {
    lines.push(`  - ${theme.theme} (${theme.count} mentions, ${theme.sentiment})`)
  }
}

function addFeatureRequests(
  lines: string[],
  featureRequests: ProductContext['featureRequests'],
): void {
  if (!featureRequests?.length) return

  lines.push('Top Feature Requests:')
  for (const req of featureRequests.slice(0, 5)) {
    lines.push(`  - ${req.title} (${req.votes} votes, ${req.status})`)
  }
}

function addFunnelMetrics(lines: string[], funnelMetrics: ProductContext['funnelMetrics']): void {
  if (!funnelMetrics?.length) return

  lines.push('Funnel Drop-off Rates:')
  for (const step of funnelMetrics) {
    lines.push(`  - ${step.step}: ${step.dropOffRate}%`)
  }
}

function formatProductContext(ctx: ProductContext): string {
  const lines: string[] = ['<product_context>']

  if (ctx.nps !== undefined) lines.push(`NPS Score: ${ctx.nps}`)
  if (ctx.csat !== undefined) lines.push(`CSAT Score: ${ctx.csat}`)
  if (ctx.accessibilityScore !== undefined)
    lines.push(`Accessibility Score: ${ctx.accessibilityScore}/100`)

  addFeedbackThemes(lines, ctx.feedbackThemes)
  addFeatureRequests(lines, ctx.featureRequests)
  addFunnelMetrics(lines, ctx.funnelMetrics)

  if (ctx.supportThemes?.length) {
    lines.push(`Support Ticket Themes: ${ctx.supportThemes.join(', ')}`)
  }

  if (ctx.userPersonas?.length) {
    lines.push(`User Personas: ${ctx.userPersonas.join(', ')}`)
  }

  lines.push('</product_context>')
  return lines.join('\n')
}

function addPerformanceMetrics(
  lines: string[],
  performance: EngineeringContext['performance'],
): void {
  if (!performance) return

  lines.push('Performance:')
  if (performance.p50Latency !== undefined)
    lines.push(`  - P50 Latency: ${performance.p50Latency}ms`)
  if (performance.p95Latency !== undefined)
    lines.push(`  - P95 Latency: ${performance.p95Latency}ms`)
  if (performance.p99Latency !== undefined)
    lines.push(`  - P99 Latency: ${performance.p99Latency}ms`)
}

function addTechDebtItems(lines: string[], techDebt: EngineeringContext['techDebt']): void {
  if (!techDebt?.length) return

  lines.push('Tech Debt:')
  for (const item of techDebt.slice(0, 5)) {
    lines.push(`  - [${item.severity}] ${item.description}${item.file ? ` (${item.file})` : ''}`)
  }
}

function addVulnerabilityItems(
  lines: string[],
  vulnerabilities: EngineeringContext['vulnerabilities'],
): void {
  if (!vulnerabilities?.length) return

  lines.push('Vulnerabilities:')
  for (const vuln of vulnerabilities.slice(0, 5)) {
    lines.push(
      `  - [${vuln.severity}] ${vuln.package} (fix ${vuln.fixAvailable ? 'available' : 'not available'})`,
    )
  }
}

function formatEngineeringContext(ctx: EngineeringContext): string {
  const lines: string[] = ['<engineering_context>']

  if (ctx.testCoverage !== undefined) lines.push(`Test Coverage: ${ctx.testCoverage}%`)
  if (ctx.lintErrors !== undefined) lines.push(`Lint Errors: ${ctx.lintErrors}`)
  if (ctx.typeErrors !== undefined) lines.push(`Type Errors: ${ctx.typeErrors}`)
  if (ctx.errorRate !== undefined) lines.push(`Error Rate: ${ctx.errorRate}%`)
  if (ctx.buildStatus) lines.push(`Build Status: ${ctx.buildStatus}`)
  if (ctx.openPRs !== undefined) lines.push(`Open PRs: ${ctx.openPRs}`)

  addPerformanceMetrics(lines, ctx.performance)
  addTechDebtItems(lines, ctx.techDebt)
  addVulnerabilityItems(lines, ctx.vulnerabilities)

  lines.push('</engineering_context>')
  return lines.join('\n')
}

export function formatPersonaContext(
  persona: AgentPersona,
  context: PersonaContext,
): string | undefined {
  return match(persona)
    .with('steve', () => (context.business ? formatBusinessContext(context.business) : undefined))
    .with('rachel', () => (context.product ? formatProductContext(context.product) : undefined))
    .with('ozby', () =>
      context.engineering ? formatEngineeringContext(context.engineering) : undefined,
    )
    .with('volker', 'jeramy', 'rodrigo', (): string | undefined => {
      return
    })
    .exhaustive()
}

export function getPersonaContextHeader(persona: AgentPersona): string {
  return match(persona)
    .with('steve', () => '# Business Intelligence')
    .with('rachel', () => '# Product & User Insights')
    .with('ozby', () => '# Engineering Metrics')
    .otherwise(() => '# Context')
}
