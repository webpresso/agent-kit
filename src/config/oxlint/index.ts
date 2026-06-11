import codeSafety from './code-safety.js'
import foundationPurity from './foundation-purity.js'
import graphqlConventions from './graphql-conventions.js'
import importHygiene from './import-hygiene.js'
import monorepoNpaths from './monorepo-paths.js'
import queryPatterns from './query-patterns.js'
import testingQuality from './testing-quality.js'
import tierBoundaries from './tier-boundaries.js'

type OxlintRuleSeverity = 'error'

interface OxlintPlugin {
  meta: {
    name: string
  }
  rules: Record<string, unknown>
}

export {
  codeSafety,
  foundationPurity,
  graphqlConventions,
  importHygiene,
  monorepoNpaths,
  queryPatterns,
  testingQuality,
  tierBoundaries,
}

const pluginEntries = [
  codeSafety,
  foundationPurity,
  graphqlConventions,
  importHygiene,
  monorepoNpaths,
  queryPatterns,
  testingQuality,
  tierBoundaries,
].map((plugin) => [plugin.meta.name, plugin] as const)

export const plugins = Object.fromEntries(pluginEntries) as Record<string, OxlintPlugin>
export const jsPlugins = [
  '@webpresso/agent-kit/oxlint/code-safety',
  '@webpresso/agent-kit/oxlint/foundation-purity',
  '@webpresso/agent-kit/oxlint/graphql-conventions',
  '@webpresso/agent-kit/oxlint/import-hygiene',
  '@webpresso/agent-kit/oxlint/monorepo-paths',
  '@webpresso/agent-kit/oxlint/query-patterns',
  '@webpresso/agent-kit/oxlint/testing-quality',
  '@webpresso/agent-kit/oxlint/tier-boundaries',
] as const

export const rules = Object.fromEntries(
  pluginEntries.flatMap(([pluginName, plugin]) =>
    Object.keys(plugin.rules).map((ruleName) => [
      `${pluginName}/${ruleName}`,
      'error' satisfies OxlintRuleSeverity,
    ]),
  ),
) as Record<string, OxlintRuleSeverity>

export const config = {
  jsPlugins,
  rules,
} satisfies {
  jsPlugins: readonly string[]
  rules: Record<string, OxlintRuleSeverity>
}

export default config
