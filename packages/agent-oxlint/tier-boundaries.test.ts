import { describe, expect, it } from 'vitest'

import graphqlPlugin from './src/graphql-conventions.js'
import tierBoundariesPlugin, {
  resolveFileTierContext,
  resolveImportTierContext,
} from './src/tier-boundaries.js'

const queryPatternsPlugin = (
  await import('./src/query-patterns.js').catch(() => ({
    default: {
      meta: { name: 'webpresso-query-patterns' },
      rules: {},
    },
  }))
).default as {
  rules: Record<string, { create: (context: unknown) => Record<string, (node: unknown) => void> }>
}

interface Report {
  message: string
  node: unknown
}

interface SourceCodeCapableNode {
  range?: [number, number]
  start?: number
  end?: number
}

function getNodeRange(node: SourceCodeCapableNode | undefined) {
  if (Array.isArray(node?.range) && node.range.length === 2) {
    return node.range
  }

  if (typeof node?.start === 'number' && typeof node?.end === 'number') {
    return [node.start, node.end] as const
  }

  return null
}

function createContext(filename: string, sourceText = '') {
  const reports: Report[] = []

  return {
    context: {
      filename,
      getFilename() {
        return filename
      },
      sourceCode: {
        getText(node?: SourceCodeCapableNode) {
          const range = getNodeRange(node)
          if (!range) {
            return sourceText
          }

          return sourceText.slice(range[0], range[1])
        },
      },
      report(report: Report) {
        reports.push(report)
      },
    },
    reports,
  }
}

function createLiteral(value: string) {
  return {
    type: 'Literal',
    value,
  }
}

function runImport(filename: string, source: string) {
  const { context, reports } = createContext(filename)
  const rule = getRule(
    tierBoundariesPlugin as {
      rules: Record<
        string,
        { create: (context: unknown) => Record<string, (node: unknown) => void> }
      >
    },
    'no-higher-tier-imports',
  )
  const visitors = rule.create(context)

  visitors.ImportDeclaration?.({
    source: createLiteral(source),
  })

  return reports
}

function createQueryCall(hookName: string, firstArgument: unknown) {
  return {
    type: 'CallExpression',
    callee: {
      type: 'Identifier',
      name: hookName,
    },
    arguments: [firstArgument],
  }
}

function createObjectExpression() {
  return {
    type: 'ObjectExpression',
    properties: [],
  }
}

function createIdentifier(name: string) {
  return {
    type: 'Identifier',
    name,
  }
}

function getRule(
  plugin: {
    rules: Record<string, { create: (context: unknown) => Record<string, (node: unknown) => void> }>
  },
  ruleName: string,
) {
  const rule = plugin.rules[ruleName]
  if (!rule) {
    throw new Error(`Expected oxlint rule "${ruleName}" to be registered in the test plugin`)
  }
  return rule as { create: (context: unknown) => Record<string, (node: unknown) => void> }
}

describe('tier-boundaries oxlint plugin', () => {
  it('derives tiers from package-boundaries.js', () => {
    expect(resolveFileTierContext('/repo/packages/foundation/utils/src/index.ts')).toEqual({
      kind: 'package',
      packageName: 'utils',
      tier: 0,
    })
    expect(resolveFileTierContext('/repo/packages/core/database/src/index.ts')).toEqual({
      kind: 'package',
      packageName: 'database',
      tier: 1,
    })
    expect(resolveFileTierContext('/repo/apps/cli-wp/src/index.ts')).toEqual({
      kind: 'package',
      packageName: 'cli-wp',
      tier: 3,
    })
    expect(resolveImportTierContext('@webpresso/app-core/testing')).toEqual({
      kind: 'package',
      packageName: 'app-core',
      tier: 2,
    })
    expect(resolveFileTierContext('/repo/infra/src/deploy.ts')).toEqual({ kind: 'infra' })
    expect(resolveImportTierContext('packages-public/sdk')).toEqual({ kind: 'packages-public' })
  })

  it('allows same-tier and lower-tier imports', () => {
    expect(runImport('/repo/packages/core/database/src/index.ts', '@webpresso/ui')).toEqual([])
    expect(runImport('/repo/packages/feature/app-core/src/index.ts', '@webpresso/utils')).toEqual(
      [],
    )
  })

  it('rejects higher-tier imports', () => {
    expect(
      runImport('/repo/packages/foundation/utils/src/index.ts', '@webpresso/database'),
    ).toEqual([
      expect.objectContaining({
        message:
          'Tier boundary violation: "utils" (tier 0) must not import higher-tier package "database" (tier 1).',
      }),
    ])
  })

  it('preserves infra and packages-public exceptions', () => {
    expect(runImport('/repo/infra/src/deploy.ts', '@webpresso/app-core')).toEqual([])
    expect(runImport('/repo/packages/core/database/src/index.ts', 'packages-public/sdk')).toEqual(
      [],
    )
  })
})

describe('graphql-conventions oxlint plugin', () => {
  it('allows gql tagged templates outside client query surfaces', () => {
    const { context, reports } = createContext(
      '/repo/packages/sdk/schema-engine/src/emitters/frontend.ts',
      'const query = gql`query { users { id } }`',
    )
    const rule = getRule(
      graphqlPlugin as {
        rules: Record<
          string,
          { create: (context: unknown) => Record<string, (node: unknown) => void> }
        >
      },
      'no-inline-graphql-in-app',
    )
    const visitors = rule.create(context)

    visitors.TaggedTemplateExpression?.({
      type: 'TaggedTemplateExpression',
      tag: createIdentifier('gql'),
      quasi: {
        type: 'TemplateLiteral',
        quasis: [{ value: { raw: 'query { users { id } }', cooked: 'query { users { id } }' } }],
        expressions: [],
        range: [17, 39],
      },
      range: [14, 39],
    })

    expect(reports).toEqual([])
  })

  it('rejects inline gql tagged templates in client query surfaces', () => {
    const sourceText = 'const query = gql`query { users { id } }`'
    const { context, reports } = createContext(
      '/repo/apps/web/platform-web/app/hooks/useNotifications.ts',
      sourceText,
    )
    const rule = getRule(
      graphqlPlugin as {
        rules: Record<
          string,
          { create: (context: unknown) => Record<string, (node: unknown) => void> }
        >
      },
      'no-inline-graphql-in-app',
    )
    const visitors = rule.create(context)

    visitors.TaggedTemplateExpression?.({
      type: 'TaggedTemplateExpression',
      tag: createIdentifier('gql'),
      quasi: {
        type: 'TemplateLiteral',
        quasis: [{ value: { raw: 'query { users { id } }', cooked: 'query { users { id } }' } }],
        expressions: [],
        range: [17, 39],
      },
      range: [14, sourceText.length],
    })

    expect(reports).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('Inline GraphQL is banned'),
      }),
    ])
  })

  it('rejects GraphQL comment-tagged templates in client query surfaces', () => {
    const sourceText = 'const query = /* GraphQL */ `query { users { id } }`'
    const templateStart = sourceText.indexOf('`')
    const { context, reports } = createContext(
      '/repo/packages/feature/sprints-ui/src/hooks/useTaskAnalysis.ts',
      sourceText,
    )
    const rule = getRule(
      graphqlPlugin as {
        rules: Record<
          string,
          { create: (context: unknown) => Record<string, (node: unknown) => void> }
        >
      },
      'no-inline-graphql-in-app',
    )
    const visitors = rule.create(context)

    visitors.TemplateLiteral?.({
      type: 'TemplateLiteral',
      quasis: [{ value: { raw: 'query { users { id } }', cooked: 'query { users { id } }' } }],
      expressions: [],
      range: [templateStart, sourceText.length],
      start: templateStart,
      parent: {
        type: 'VariableDeclarator',
        range: [0, sourceText.length],
      },
    })

    expect(reports).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('Inline GraphQL is banned'),
      }),
    ])
  })
})

describe('query-patterns oxlint plugin', () => {
  it('allows named query options identifiers', () => {
    const { context, reports } = createContext('/repo/apps/web/platform-web/app/routes/example.tsx')
    const rule = getRule(queryPatternsPlugin, 'no-adhoc-useQuery')
    const visitors = rule.create(context)

    visitors.CallExpression?.(
      createQueryCall('useQuery', createIdentifier('notificationsQueryOptions')),
    )

    expect(reports).toEqual([])
  })

  it('rejects ad-hoc object literals passed to query hooks', () => {
    const { context, reports } = createContext('/repo/apps/web/platform-web/app/routes/example.tsx')
    const rule = getRule(queryPatternsPlugin, 'no-adhoc-useQuery')
    const visitors = rule.create(context)

    visitors.CallExpression?.(createQueryCall('useSuspenseQuery', createObjectExpression()))

    expect(reports).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('named query options'),
      }),
    ])
  })

  it('allows isLoading on mutation results', () => {
    const { context, reports } = createContext('/repo/apps/web/platform-web/app/routes/example.tsx')
    const rule = getRule(queryPatternsPlugin, 'no-isLoading-on-queries')
    const visitors = rule.create(context)

    visitors.VariableDeclarator?.({
      type: 'VariableDeclarator',
      id: createIdentifier('saveMutation'),
      init: createQueryCall('useMutation', createIdentifier('saveOptions')),
    })

    visitors.MemberExpression?.({
      type: 'MemberExpression',
      object: createIdentifier('saveMutation'),
      property: createIdentifier('isLoading'),
      computed: false,
    })

    expect(reports).toEqual([])
  })

  it('rejects destructuring isLoading from query results', () => {
    const { context, reports } = createContext(
      '/repo/packages/feature/sprints-ui/src/hooks/useAgentTaskStatus.ts',
    )
    const rule = getRule(queryPatternsPlugin, 'no-isLoading-on-queries')
    const visitors = rule.create(context)

    visitors.VariableDeclarator?.({
      type: 'VariableDeclarator',
      id: {
        type: 'ObjectPattern',
        properties: [
          {
            type: 'Property',
            key: createIdentifier('isLoading'),
            value: createIdentifier('queryLoading'),
            shorthand: false,
          },
        ],
      },
      init: createQueryCall('useQuery', createIdentifier('agentTaskStatusOptions')),
    })

    expect(reports).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('isPending'),
      }),
    ])
  })
})
