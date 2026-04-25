// Webpresso import hygiene rules — replaces GritQL patterns:
// - no-relative-parent-imports
// - no-src-path-imports
// - no-relative-mock-paths
// - no-forbidden-package-imports

const CROSS_PACKAGE_SEGMENT = /(?:^|\/)(packages|apps|tooling|infra|webpresso)\//

function isRelativeParentPath(source) {
  return typeof source === 'string' && source.includes('../')
}

function isRelativeGeneratedImport(source) {
  return (
    typeof source === 'string' &&
    source.startsWith('.') &&
    source.includes('.webpresso/generated/')
  )
}

function isGeneratedPathsSourceImport(source) {
  return (
    typeof source === 'string' &&
    source.includes('/packages/cli/cli-utils/src/generated-paths')
  )
}

function isAllowedRelativeParentImport(source) {
  return isGeneratedPathsSourceImport(source)
}

function isCrossPackageRelativePath(source) {
  return isRelativeParentPath(source) && CROSS_PACKAGE_SEGMENT.test(source)
}

function reportRelativeParentImport(context, node) {
  context.report({
    node,
    message:
      'Use `#` or package imports instead of relative parent imports. For cross-package access, add a proper package export and import via the package name.',
  })
}

function reportCrossPackageImport(context, node) {
  context.report({
    node,
    message:
      'Do not reach into another package/app with a relative filesystem import. Add a proper package export and import it via the package name.',
  })
}

function normalizeFilename(filename) {
  return typeof filename === 'string' ? filename.replaceAll('\\', '/') : ''
}

function getFilename(context) {
  if (typeof context.getFilename === 'function') {
    return normalizeFilename(context.getFilename())
  }

  return normalizeFilename(context.filename)
}

function checkStaticModuleSource(node, callback) {
  if (!node.source) return
  callback(node.source.value, node.source)
}

function isPlatformAppFile(filename) {
  return filename.includes('/apps/workers/') || filename.includes('/apps/web/')
}

function isSdkPackageFile(filename) {
  return filename.includes('/packages/sdk/')
}

function isSchemaEngineImport(source) {
  return typeof source === 'string' && source.startsWith('@webpresso/schema-engine/')
}

function isSchemaRuntimeImport(source) {
  return typeof source === 'string' && source.startsWith('@webpresso/schema-runtime')
}

function isGeneratedImport(source) {
  return typeof source === 'string' && source.startsWith('@webpresso/generated/')
}

const FORBIDDEN_SDK_TOOLING_IMPORTS = new Set([
  '@webpresso/schema-loaders',
  '@webpresso/cli-utils',
  '@webpresso/blueprint',
])

const noRelativeParentImports = {
  create(context) {
    function checkSource(source, node) {
      if (isRelativeGeneratedImport(source)) {
        context.report({
          node,
          message:
            'Do not import generated artifacts via relative filesystem paths. Use the real workspace package `@webpresso/generated/*` instead.',
        })
        return
      }

      if (isRelativeParentPath(source) && !isAllowedRelativeParentImport(source)) {
        reportRelativeParentImport(context, node)
      }
    }

    return {
      ImportDeclaration(node) {
        checkSource(node.source.value, node.source)
      },
      // Also catch export ... from '../...'
      ExportNamedDeclaration(node) {
        checkStaticModuleSource(node, checkSource)
      },
      ExportAllDeclaration(node) {
        checkStaticModuleSource(node, checkSource)
      },
      ImportExpression(node) {
        if (node.source.type !== 'Literal') return
        const source = node.source.value
        if (isCrossPackageRelativePath(source)) {
          reportCrossPackageImport(context, node.source)
        }
      },
    }
  },
}

const noSrcPathImports = {
  create(context) {
    return {
      ImportDeclaration(node) {
        const source = node.source.value
        if (typeof source === 'string' && source.includes('../src/')) {
          context.report({
            node: node.source,
            message:
              "Use `#` alias instead of `../src/` paths. Example: `from '#database'` instead of `from '../src/database'`.",
          })
        }
      },
    }
  },
}

const noRelativeMockPaths = {
  create(context) {
    return {
      CallExpression(node) {
        if (
          node.callee.type !== 'MemberExpression' ||
          node.callee.object.type !== 'Identifier' ||
          node.callee.object.name !== 'vi' ||
          node.callee.property.type !== 'Identifier' ||
          node.callee.property.name !== 'mock'
        ) {
          return
        }

        const arg = node.arguments[0]
        if (!arg || arg.type !== 'Literal' || typeof arg.value !== 'string') return

        if (arg.value.includes('../')) {
          context.report({
            node: arg,
            message:
              "Ban vi.mock() with relative parent paths. Use the module's package name or `#` alias instead.",
          })
        }
      },
    }
  },
}

const noForbiddenPackageImports = {
  create(context) {
    const filename = getFilename(context)

    function checkImport(source, node) {
      if (typeof source !== 'string') return

      if (
        isPlatformAppFile(filename) &&
        isSchemaEngineImport(source) &&
        source !== '@webpresso/schema-engine/api'
      ) {
        context.report({
          node,
          message:
            'Platform apps may only import `@webpresso/schema-engine/api`, `@webpresso/generated/*`, or `@webpresso/schema-runtime/*`. Move schema-engine internals behind a public surface.',
        })
        return
      }

      if (isPlatformAppFile(filename) && isGeneratedImport(source)) {
        return
      }

      if (isSdkPackageFile(filename) && FORBIDDEN_SDK_TOOLING_IMPORTS.has(source)) {
        context.report({
          node,
          message:
            'SDK packages must not import CLI/tooling packages such as `@webpresso/schema-loaders`, `@webpresso/cli-utils`, or `@webpresso/blueprint`.',
        })
        return
      }

      // Runtime helpers are allowed for platform apps, so keep the explicit allowlist
      // visible here rather than indirectly relying on a broader schema-engine prefix.
      if (
        isPlatformAppFile(filename) &&
        isSchemaRuntimeImport(source) &&
        !source.startsWith('@webpresso/schema-runtime/')
      ) {
        context.report({
          node,
          message:
            'Platform apps must import `@webpresso/schema-runtime/*` subpaths, not the package root.',
        })
      }
    }

    return {
      ImportDeclaration(node) {
        checkImport(node.source.value, node.source)
      },
      ExportNamedDeclaration(node) {
        checkStaticModuleSource(node, checkImport)
      },
      ExportAllDeclaration(node) {
        checkStaticModuleSource(node, checkImport)
      },
      ImportExpression(node) {
        if (node.source.type !== 'Literal') return
        checkImport(node.source.value, node.source)
      },
    }
  },
}

const plugin = {
  meta: { name: 'webpresso-imports' },
  rules: {
    'no-relative-parent-imports': noRelativeParentImports,
    'no-src-path-imports': noSrcPathImports,
    'no-relative-mock-paths': noRelativeMockPaths,
    'no-forbidden-package-imports': noForbiddenPackageImports,
  },
}

export default plugin
