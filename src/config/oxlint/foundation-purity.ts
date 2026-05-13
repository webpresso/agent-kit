// @ts-nocheck
// Foundation purity — prevents framework coupling in the foundation tier.
// Flags imports from hono, express, fastify, koa in packages/foundation/ files.

const FORBIDDEN_FRAMEWORKS = new Set(['hono', 'express', 'fastify', 'koa'])

function isForbiddenImport(source) {
  return typeof source === 'string' && FORBIDDEN_FRAMEWORKS.has(source.split('/')[0])
}

function isFoundationFile(context) {
  const filename =
    typeof context.getFilename === 'function' ? context.getFilename() : context.filename

  return filename.replaceAll('\\', '/').includes('/packages/foundation/')
}

const noFrameworkImports = {
  create(context) {
    if (!isFoundationFile(context)) return {}

    function checkImport(source, node) {
      if (isForbiddenImport(source)) {
        context.report({
          node,
          message: `Foundation packages must not depend on HTTP frameworks. Remove import from "${source}" — framework adapters belong in apps or feature packages.`,
        })
      }
    }

    return {
      ImportDeclaration(node) {
        checkImport(node.source.value, node.source)
      },
      ExportNamedDeclaration(node) {
        if (!node.source) return
        checkImport(node.source.value, node.source)
      },
      ExportAllDeclaration(node) {
        if (!node.source) return
        checkImport(node.source.value, node.source)
      },
      ImportExpression(node) {
        if (node.source.type !== 'Literal') return
        checkImport(node.source.value, node.source)
      },
    }
  },
}

const plugin = {
  meta: { name: 'webpresso-foundation-purity' },
  rules: {
    'no-framework-imports': noFrameworkImports,
  },
}

export default plugin
