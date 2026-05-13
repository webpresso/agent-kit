// @ts-nocheck
const QUERY_HOOK_NAMES = new Set(['useQuery', 'useSuspenseQuery', 'useInfiniteQuery'])

function normalizeFilename(filename) {
  return typeof filename === 'string' ? filename.replaceAll('\\', '/') : ''
}

function getFilename(context) {
  if (typeof context.getFilename === 'function') {
    return normalizeFilename(context.getFilename())
  }

  return normalizeFilename(context.filename)
}

function isClientQuerySurface(filename) {
  const normalized = normalizeFilename(filename)
  if (!/\.tsx?$/.test(normalized)) return false
  if (normalized.includes('/.webpresso/generated/')) return false

  const isWebAppSurface = normalized.includes('/apps/web/') && normalized.includes('/app/')
  const isFeatureSurface = normalized.includes('/packages/feature/') && normalized.includes('/src/')

  return isWebAppSurface || isFeatureSurface
}

function getCalleeName(callee) {
  if (!callee) return null
  if (callee.type === 'Identifier') return callee.name

  if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property?.type === 'Identifier'
  ) {
    return callee.property.name
  }

  return null
}

function isQueryHookCall(node) {
  return node?.type === 'CallExpression' && QUERY_HOOK_NAMES.has(getCalleeName(node.callee))
}

function isTrackedQueryResult(init, queryResultBindings) {
  return init?.type === 'Identifier' && queryResultBindings.has(init.name)
}

function isIsLoadingProperty(property) {
  return (
    (property?.type === 'Identifier' && property.name === 'isLoading') ||
    (property?.type === 'Literal' && property.value === 'isLoading')
  )
}

function reportAdhocQuery(context, node) {
  context.report({
    node,
    message:
      'TanStack Query hard cut: pass a named query options identifier to useQuery/useSuspenseQuery/useInfiniteQuery instead of an inline object literal.',
  })
}

function reportIsLoading(context, node) {
  context.report({
    node,
    message:
      'TanStack Query hard cut: use isPending (or domain-specific derived state) instead of isLoading on query results.',
  })
}

const noAdhocUseQuery = {
  create(context) {
    if (!isClientQuerySurface(getFilename(context))) {
      return {}
    }

    return {
      CallExpression(node) {
        if (!isQueryHookCall(node)) return

        const firstArgument = node.arguments[0]
        if (firstArgument?.type !== 'ObjectExpression') return

        reportAdhocQuery(context, firstArgument)
      },
    }
  },
}

const noIsLoadingOnQueries = {
  create(context) {
    if (!isClientQuerySurface(getFilename(context))) {
      return {}
    }

    const queryResultBindings = new Set()

    function trackQueryResultBinding(id, init) {
      if (id?.type !== 'Identifier') return
      if (!isQueryHookCall(init)) return
      queryResultBindings.add(id.name)
    }

    function reportObjectPattern(node) {
      for (const property of node.properties ?? []) {
        if (property?.type !== 'Property') continue
        if (!isIsLoadingProperty(property.key)) continue
        reportIsLoading(context, property.key)
      }
    }

    return {
      VariableDeclarator(node) {
        trackQueryResultBinding(node.id, node.init)

        if (node.id?.type !== 'ObjectPattern') return
        if (!isQueryHookCall(node.init) && !isTrackedQueryResult(node.init, queryResultBindings))
          return

        reportObjectPattern(node.id)
      },
      MemberExpression(node) {
        if (node.computed) return
        if (!isIsLoadingProperty(node.property)) return
        if (node.object?.type !== 'Identifier') return
        if (!queryResultBindings.has(node.object.name)) return

        reportIsLoading(context, node.property)
      },
    }
  },
}

const plugin = {
  meta: { name: 'webpresso-query-patterns' },
  rules: {
    'no-adhoc-useQuery': noAdhocUseQuery,
    'no-isLoading-on-queries': noIsLoadingOnQueries,
  },
}

export default plugin
