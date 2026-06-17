import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { auditReferenceParityMatrix } from './reference-parity-matrix.js'

import ts from 'typescript'

import type { RepoAuditResult, RepoAuditViolation } from './repo-guardrails.js'

const CONTRACT_DOC_PATH = 'docs/ai-reliability-contract.md'
const RESULT_HELPER_PATH = 'src/mcp/tools/_shared/result.ts'
const MCP_DISCOVERY_PATH = 'src/mcp/auto-discover.ts'
const MCP_INTEGRATION_TEST_PATH = 'src/mcp/server.integration.test.ts'
const PUBLIC_README_PATH = 'README.md'
const PUBLIC_CHANGELOG_PATH = 'CHANGELOG.md'
const PENDING_CHANGESET_SURFACE_PATH = '.changeset/*.md'

const REFERENCE_PARITY_EVIDENCE = [
  'docs/bench/reference-parity-matrix.md',
  'src/__integration__/reference-parity-host-smoke.integration.test.ts',
  'src/__integration__/reference-parity-tool-surface.integration.test.ts',
  'docs/bench/session-memory-methodology.md',
] as const

const FULL_REPLACEMENT_CLAIM_PATTERN =
  /(?:drop[- ]?in replacement|100%\s+parity|full\s+replacement\s+parity|complete\s+replacement\s+parity|full\s+host\s+lifecycle\s+claims)/iu

const SUMMARY_FIRST_TOOLS = [
  'src/mcp/tools/test.ts',
  'src/mcp/tools/lint.ts',
  'src/mcp/tools/typecheck.ts',
  'src/mcp/tools/qa.ts',
  'src/mcp/tools/audit.ts',
] as const

const EXPLICIT_ERROR_TOOLS = [
  'src/mcp/tools/lint.ts',
  'src/mcp/tools/qa.ts',
  'src/mcp/tools/audit.ts',
  'src/mcp/tools/format.ts',
  'src/mcp/tools/ci-act.ts',
] as const

export function auditAiContracts(rootDirectory: string = process.cwd()): RepoAuditResult {
  const root = resolve(rootDirectory)
  const violations: RepoAuditViolation[] = []
  let checked = 0

  checked += expectFileContains(root, CONTRACT_DOC_PATH, '# AI Reliability Contract', violations, {
    message:
      'Missing canonical AI reliability contract doc. Add docs/ai-reliability-contract.md so consumers have one source of truth.',
  })
  checked += expectFileContains(root, CONTRACT_DOC_PATH, '## Contract Rules', violations, {
    message: 'AI reliability doc must define contract rules explicitly.',
  })

  checked += expectSourcePredicate(
    root,
    RESULT_HELPER_PATH,
    hasCreateSummaryResultStructuredPayload,
    violations,
    {
      message:
        'Summary-first MCP result helper must return structuredContent and support explicit isError signaling.',
    },
  )

  checked += expectSourcePredicate(
    root,
    MCP_DISCOVERY_PATH,
    (sourceFile) =>
      hasInterfaceProperty(sourceFile, 'ToolHandlerResult', 'structuredContent') &&
      hasInterfaceProperty(sourceFile, 'ToolHandlerResult', 'isError') &&
      hasInterfaceProperty(sourceFile, 'ToolDescriptor', 'outputSchema'),
    violations,
    {
      message:
        'Tool discovery contract must advertise structuredContent, isError, and outputSchema.',
    },
  )

  checked += expectFileContains(root, MCP_INTEGRATION_TEST_PATH, 'tools/list', violations, {
    message: 'MCP integration tests must exercise tools/list to verify advertised schemas.',
  })
  checked += expectFileContains(root, MCP_INTEGRATION_TEST_PATH, 'structuredContent', violations, {
    message: 'MCP integration tests must assert structuredContent passthrough for built-in tools.',
  })

  for (const toolPath of SUMMARY_FIRST_TOOLS) {
    checked += expectSourcePredicate(
      root,
      toolPath,
      (sourceFile) =>
        defaultExportObjectHasProperty(sourceFile, 'outputSchema') &&
        fileCallsIdentifier(sourceFile, 'createSummaryResult'),
      violations,
      {
        message:
          'Summary-first wp_* tools must advertise outputSchema and return results via createSummaryResult().',
      },
    )
  }

  for (const toolPath of EXPLICIT_ERROR_TOOLS) {
    checked += expectSourcePredicate(root, toolPath, hasIsErrorTrueObjectLiteral, violations, {
      message:
        'Tools with composition/spawn/parse failure branches should mark tool execution failure with isError: true.',
    })
  }

  checked += auditReferenceParityPublicClaims(root, violations)

  return {
    ok: violations.length === 0,
    title: 'AI contracts audit',
    checked,
    violations,
  }
}

function auditReferenceParityPublicClaims(root: string, violations: RepoAuditViolation[]): number {
  const matrix = auditReferenceParityMatrix(root, undefined, { requireReleaseReady: true })
  let checked = 0

  const publicSurfaces: Array<{ path: string; content: string; pendingChangeset?: boolean }> = []
  for (const relativePath of [PUBLIC_README_PATH, PUBLIC_CHANGELOG_PATH]) {
    const content = readExistingFile(root, relativePath, violations, {
      message: 'Reference parity claim gate requires the public disclosure surface to exist.',
    })
    checked += 1
    if (!content) continue
    publicSurfaces.push({
      path: relativePath,
      content: relativePath === PUBLIC_CHANGELOG_PATH ? latestChangelogEntry(content) : content,
    })
  }

  const pendingChangesetReleaseNotes = readPendingChangesetReleaseNotes(root)
  if (pendingChangesetReleaseNotes) {
    publicSurfaces.push({
      path: PENDING_CHANGESET_SURFACE_PATH,
      content: pendingChangesetReleaseNotes,
      pendingChangeset: true,
    })
  }

  for (const surface of publicSurfaces) {
    for (const evidencePath of REFERENCE_PARITY_EVIDENCE) {
      if (!surface.content.includes(evidencePath)) {
        violations.push({
          file: surface.path,
          message:
            surface.path === PENDING_CHANGESET_SURFACE_PATH
              ? `Pending changeset release notes must cite ${evidencePath} before Changesets generates CHANGELOG.md.`
              : `Reference parity public claim gate must cite ${evidencePath}.`,
        })
        continue
      }

      if (
        surface.pendingChangeset &&
        hasMarkdownEmphasisRisk(evidencePath) &&
        !hasInlineCodeCitation(surface.content, evidencePath)
      ) {
        violations.push({
          file: surface.path,
          message: `Pending changeset release notes must cite ${evidencePath} as inline code so Changesets preserves the literal path in CHANGELOG.md.`,
        })
      }
    }

    if (!matrix.releaseClaimGateReady && FULL_REPLACEMENT_CLAIM_PATTERN.test(surface.content)) {
      violations.push({
        file: surface.path,
        message:
          'Public release wording must not claim full replacement parity until reference parity strict readiness passes.',
      })
    }
  }

  checked += 1
  if (matrix.violations.length > 0 && matrix.releaseClaimGateReady) {
    violations.push({
      file: 'docs/bench/reference-parity-matrix.md',
      message:
        'Reference parity matrix cannot be release-ready while strict audit violations exist.',
    })
  }

  return checked
}

function hasMarkdownEmphasisRisk(evidencePath: string): boolean {
  return evidencePath.includes('__')
}

function hasInlineCodeCitation(content: string, evidencePath: string): boolean {
  return content.includes(`\`${evidencePath}\``)
}

function readPendingChangesetReleaseNotes(root: string): string | null {
  const changesetDirectory = resolve(root, '.changeset')
  if (!existsSync(changesetDirectory)) return null

  const changesetFiles = readdirSync(changesetDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md')
    .map((entry) => entry.name)
    .sort()

  if (changesetFiles.length === 0) return null

  return changesetFiles
    .map((changesetFile) => readFileSync(resolve(changesetDirectory, changesetFile), 'utf8'))
    .join('\n\n')
}

function readExistingFile(
  root: string,
  relativePath: string,
  violations: RepoAuditViolation[],
  options: { message: string },
): string | null {
  const filePath = resolve(root, relativePath)
  if (!existsSync(filePath)) {
    violations.push({ file: relativePath, message: options.message })
    return null
  }
  return readFileSync(filePath, 'utf8')
}

function latestChangelogEntry(content: string): string {
  const firstHeading = content.search(/^##\s+/mu)
  if (firstHeading === -1) return content
  const rest = content.slice(firstHeading)
  const nextHeading = rest.slice(1).search(/^##\s+/mu)
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading + 1)
}

function expectFileContains(
  root: string,
  relativePath: string,
  needle: string,
  violations: RepoAuditViolation[],
  options: { message: string },
): number {
  const filePath = resolve(root, relativePath)
  if (!existsSync(filePath)) {
    violations.push({
      file: relativePath,
      message: `${options.message} File is missing.`,
    })
    return 1
  }

  const content = readFileSync(filePath, 'utf8')
  if (!content.includes(needle)) {
    violations.push({
      file: relativePath,
      message: `${options.message} Expected to find ${JSON.stringify(needle)}.`,
    })
  }
  return 1
}

function expectSourcePredicate(
  root: string,
  relativePath: string,
  predicate: (sourceFile: ts.SourceFile) => boolean,
  violations: RepoAuditViolation[],
  options: { message: string },
): number {
  const sourceFile = loadSourceFile(root, relativePath)
  if (!sourceFile) {
    violations.push({
      file: relativePath,
      message: `${options.message} File is missing or unreadable.`,
    })
    return 1
  }

  if (!predicate(sourceFile)) {
    violations.push({
      file: relativePath,
      message: options.message,
    })
  }
  return 1
}

function loadSourceFile(root: string, relativePath: string): ts.SourceFile | undefined {
  const filePath = resolve(root, relativePath)
  if (!existsSync(filePath)) return undefined
  const content = readFileSync(filePath, 'utf8')
  return ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

function hasInterfaceProperty(
  sourceFile: ts.SourceFile,
  interfaceName: string,
  propertyName: string,
): boolean {
  let found = false

  visit(sourceFile, (node) => {
    if (
      ts.isInterfaceDeclaration(node) &&
      node.name.text === interfaceName &&
      node.members.some(
        (member) => ts.isPropertySignature(member) && getPropertyName(member.name) === propertyName,
      )
    ) {
      found = true
      return true
    }
    return false
  })

  return found
}

function hasCreateSummaryResultStructuredPayload(sourceFile: ts.SourceFile): boolean {
  let foundStructuredContent = false
  let foundIsError = false

  visit(sourceFile, (node) => {
    if (!ts.isFunctionDeclaration(node) || node.name?.text !== 'createSummaryResult') {
      return false
    }

    visit(node.body, (inner) => {
      if (!ts.isObjectLiteralExpression(inner)) return false
      for (const property of inner.properties) {
        if (ts.isPropertyAssignment(property)) {
          const name = getPropertyName(property.name)
          if (name === 'structuredContent') foundStructuredContent = true
          if (name === 'isError' && property.initializer.kind === ts.SyntaxKind.TrueKeyword) {
            foundIsError = true
          }
        }
        if (
          ts.isSpreadAssignment(property) &&
          ts.isConditionalExpression(property.expression) &&
          ts.isObjectLiteralExpression(property.expression.whenTrue)
        ) {
          for (const spreadProperty of property.expression.whenTrue.properties) {
            if (
              ts.isPropertyAssignment(spreadProperty) &&
              getPropertyName(spreadProperty.name) === 'isError' &&
              spreadProperty.initializer.kind === ts.SyntaxKind.TrueKeyword
            ) {
              foundIsError = true
            }
          }
        }
      }
      return false
    })

    return true
  })

  return foundStructuredContent && foundIsError
}

function defaultExportObjectHasProperty(sourceFile: ts.SourceFile, propertyName: string): boolean {
  let found = false

  visit(sourceFile, (node) => {
    if (ts.isExportAssignment(node) && ts.isIdentifier(node.expression)) {
      const identifier = node.expression.text
      const declaration = findVariableDeclaration(sourceFile, identifier)
      if (
        declaration &&
        declaration.initializer &&
        ts.isObjectLiteralExpression(declaration.initializer) &&
        declaration.initializer.properties.some(
          (property) =>
            (ts.isPropertyAssignment(property) &&
              getPropertyName(property.name) === propertyName) ||
            (ts.isShorthandPropertyAssignment(property) && property.name.text === propertyName),
        )
      ) {
        found = true
        return true
      }
    }
    return false
  })

  return found
}

function findVariableDeclaration(
  sourceFile: ts.SourceFile,
  identifier: string,
): ts.VariableDeclaration | undefined {
  let found: ts.VariableDeclaration | undefined

  visit(sourceFile, (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === identifier
    ) {
      found = node
      return true
    }
    return false
  })

  return found
}

function fileCallsIdentifier(sourceFile: ts.SourceFile, identifier: string): boolean {
  let found = false

  visit(sourceFile, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === identifier
    ) {
      found = true
      return true
    }
    return false
  })

  return found
}

function hasIsErrorTrueObjectLiteral(sourceFile: ts.SourceFile): boolean {
  let found = false

  visit(sourceFile, (node) => {
    if (!ts.isObjectLiteralExpression(node)) return false

    if (
      node.properties.some(
        (property) =>
          ts.isPropertyAssignment(property) &&
          getPropertyName(property.name) === 'isError' &&
          property.initializer.kind === ts.SyntaxKind.TrueKeyword,
      )
    ) {
      found = true
      return true
    }

    return false
  })

  return found
}

function getPropertyName(name: ts.PropertyName | ts.BindingName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text
  }
  return undefined
}

function visit(node: ts.Node | undefined, visitor: (node: ts.Node) => boolean): void {
  if (!node) return
  let shouldStop = false
  const walk = (current: ts.Node) => {
    if (shouldStop) return
    if (visitor(current)) {
      shouldStop = true
      return
    }
    current.forEachChild(walk)
  }
  walk(node)
}
