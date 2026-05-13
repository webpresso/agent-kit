import { match } from 'ts-pattern';
function addBusinessGrowthMetrics(lines, growth) {
    if (!growth)
        return;
    lines.push('Growth:');
    if (growth.mrrGrowth !== undefined)
        lines.push(`  - MRR Growth: ${growth.mrrGrowth}%`);
    if (growth.userGrowth !== undefined)
        lines.push(`  - User Growth: ${growth.userGrowth}%`);
    if (growth.period)
        lines.push(`  - Period: ${growth.period}`);
}
function addBusinessMetrics(lines, ctx) {
    if (ctx.mrr !== undefined)
        lines.push(`MRR: $${ctx.mrr.toLocaleString()}`);
    if (ctx.arr !== undefined)
        lines.push(`ARR: $${ctx.arr.toLocaleString()}`);
    if (ctx.mau !== undefined)
        lines.push(`MAU: ${ctx.mau.toLocaleString()}`);
    if (ctx.dau !== undefined)
        lines.push(`DAU: ${ctx.dau.toLocaleString()}`);
    if (ctx.cac !== undefined)
        lines.push(`CAC: $${ctx.cac}`);
    if (ctx.ltv !== undefined)
        lines.push(`LTV: $${ctx.ltv}`);
    if (ctx.churnRate !== undefined)
        lines.push(`Churn Rate: ${ctx.churnRate}%`);
    if (ctx.conversionRate !== undefined)
        lines.push(`Conversion Rate: ${ctx.conversionRate}%`);
}
function addBusinessPriorities(lines, priorities) {
    if (!priorities?.length)
        return;
    lines.push('Strategic Priorities:');
    for (const priority of priorities) {
        lines.push(`  - ${priority}`);
    }
}
function formatBusinessContext(ctx) {
    const lines = ['<business_context>'];
    addBusinessMetrics(lines, ctx);
    addBusinessGrowthMetrics(lines, ctx.growth);
    if (ctx.competitors?.length) {
        lines.push(`Competitors: ${ctx.competitors.join(', ')}`);
    }
    addBusinessPriorities(lines, ctx.priorities);
    lines.push('</business_context>');
    return lines.join('\n');
}
function addFeedbackThemes(lines, feedbackThemes) {
    if (!feedbackThemes?.length)
        return;
    lines.push('User Feedback Themes:');
    for (const theme of feedbackThemes) {
        lines.push(`  - ${theme.theme} (${theme.count} mentions, ${theme.sentiment})`);
    }
}
function addFeatureRequests(lines, featureRequests) {
    if (!featureRequests?.length)
        return;
    lines.push('Top Feature Requests:');
    for (const req of featureRequests.slice(0, 5)) {
        lines.push(`  - ${req.title} (${req.votes} votes, ${req.status})`);
    }
}
function addFunnelMetrics(lines, funnelMetrics) {
    if (!funnelMetrics?.length)
        return;
    lines.push('Funnel Drop-off Rates:');
    for (const step of funnelMetrics) {
        lines.push(`  - ${step.step}: ${step.dropOffRate}%`);
    }
}
function formatProductContext(ctx) {
    const lines = ['<product_context>'];
    if (ctx.nps !== undefined)
        lines.push(`NPS Score: ${ctx.nps}`);
    if (ctx.csat !== undefined)
        lines.push(`CSAT Score: ${ctx.csat}`);
    if (ctx.accessibilityScore !== undefined)
        lines.push(`Accessibility Score: ${ctx.accessibilityScore}/100`);
    addFeedbackThemes(lines, ctx.feedbackThemes);
    addFeatureRequests(lines, ctx.featureRequests);
    addFunnelMetrics(lines, ctx.funnelMetrics);
    if (ctx.supportThemes?.length) {
        lines.push(`Support Ticket Themes: ${ctx.supportThemes.join(', ')}`);
    }
    if (ctx.userPersonas?.length) {
        lines.push(`User Personas: ${ctx.userPersonas.join(', ')}`);
    }
    lines.push('</product_context>');
    return lines.join('\n');
}
function addPerformanceMetrics(lines, performance) {
    if (!performance)
        return;
    lines.push('Performance:');
    if (performance.p50Latency !== undefined)
        lines.push(`  - P50 Latency: ${performance.p50Latency}ms`);
    if (performance.p95Latency !== undefined)
        lines.push(`  - P95 Latency: ${performance.p95Latency}ms`);
    if (performance.p99Latency !== undefined)
        lines.push(`  - P99 Latency: ${performance.p99Latency}ms`);
}
function addTechDebtItems(lines, techDebt) {
    if (!techDebt?.length)
        return;
    lines.push('Tech Debt:');
    for (const item of techDebt.slice(0, 5)) {
        lines.push(`  - [${item.severity}] ${item.description}${item.file ? ` (${item.file})` : ''}`);
    }
}
function addVulnerabilityItems(lines, vulnerabilities) {
    if (!vulnerabilities?.length)
        return;
    lines.push('Vulnerabilities:');
    for (const vuln of vulnerabilities.slice(0, 5)) {
        lines.push(`  - [${vuln.severity}] ${vuln.package} (fix ${vuln.fixAvailable ? 'available' : 'not available'})`);
    }
}
function formatEngineeringContext(ctx) {
    const lines = ['<engineering_context>'];
    if (ctx.testCoverage !== undefined)
        lines.push(`Test Coverage: ${ctx.testCoverage}%`);
    if (ctx.lintErrors !== undefined)
        lines.push(`Lint Errors: ${ctx.lintErrors}`);
    if (ctx.typeErrors !== undefined)
        lines.push(`Type Errors: ${ctx.typeErrors}`);
    if (ctx.errorRate !== undefined)
        lines.push(`Error Rate: ${ctx.errorRate}%`);
    if (ctx.buildStatus)
        lines.push(`Build Status: ${ctx.buildStatus}`);
    if (ctx.openPRs !== undefined)
        lines.push(`Open PRs: ${ctx.openPRs}`);
    addPerformanceMetrics(lines, ctx.performance);
    addTechDebtItems(lines, ctx.techDebt);
    addVulnerabilityItems(lines, ctx.vulnerabilities);
    lines.push('</engineering_context>');
    return lines.join('\n');
}
export function formatPersonaContext(persona, context) {
    return match(persona)
        .with('steve', () => (context.business ? formatBusinessContext(context.business) : undefined))
        .with('rachel', () => (context.product ? formatProductContext(context.product) : undefined))
        .with('ozby', () => context.engineering ? formatEngineeringContext(context.engineering) : undefined)
        .with('volker', 'jeramy', 'rodrigo', () => {
        return;
    })
        .exhaustive();
}
export function getPersonaContextHeader(persona) {
    return match(persona)
        .with('steve', () => '# Business Intelligence')
        .with('rachel', () => '# Product & User Insights')
        .with('ozby', () => '# Engineering Metrics')
        .otherwise(() => '# Context');
}
//# sourceMappingURL=persona-context.js.map