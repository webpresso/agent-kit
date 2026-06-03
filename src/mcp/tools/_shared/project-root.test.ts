import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { ProjectRootNotFoundError, resolveProjectRoot } from './project-root.js'

const originalProjectDir = process.env.CLAUDE_PROJECT_DIR

afterEach(() => {
  if (originalProjectDir === undefined) {
    delete process.env.CLAUDE_PROJECT_DIR
  } else {
    process.env.CLAUDE_PROJECT_DIR = originalProjectDir
  }
})

describe('resolveProjectRoot', () => {
  it('stays dynamically importable via the package import path', async () => {
    const module = await import('#mcp/tools/_shared/project-root.js')
    expect(module.resolveProjectRoot).toBeTypeOf('function')
    expect(module.ProjectRootNotFoundError).toBeTypeOf('function')
  })

  it('honors CLAUDE_PROJECT_DIR when set', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wp-pr-env-'))
    expect(resolveProjectRoot({ env: { CLAUDE_PROJECT_DIR: dir }, cwd: '/nowhere' })).toBe(dir)
  })

  it('returns the closest ancestor containing .git', () => {
    const root = mkdtempSync(join(tmpdir(), 'wp-pr-git-'))
    mkdirSync(join(root, '.git'))
    const nested = join(root, 'a', 'b', 'c')
    mkdirSync(nested, { recursive: true })
    expect(resolveProjectRoot({ env: {}, cwd: nested })).toBe(root)
  })

  it(
    'anchors at workspace root: strong marker (pnpm-workspace.yaml) ' +
      'higher up wins over a closer weak marker (package.json)',
    () => {
      const root = mkdtempSync(join(tmpdir(), 'wp-pr-strong-'))
      writeFileSync(join(root, 'pnpm-workspace.yaml'), '')
      const nested = join(root, 'pkg-with-package-json')
      mkdirSync(nested)
      writeFileSync(join(nested, 'package.json'), '{}')
      // The whole point of the strong-marker pass is to skip nested package
      // dirs in monorepos — without it, walking up from a sub-package would
      // anchor at the sub-package's package.json instead of the workspace.
      expect(resolveProjectRoot({ env: {}, cwd: nested })).toBe(root)
    },
  )

  it('falls back to package.json when no strong markers exist', () => {
    const root = mkdtempSync(join(tmpdir(), 'wp-pr-pkg-'))
    writeFileSync(join(root, 'package.json'), '{}')
    expect(resolveProjectRoot({ env: {}, cwd: root })).toBe(root)
  })

  // Regression: previously every tool used `process.cwd()` directly. With
  // user-scope plugin MCP servers (anthropics/claude-code#42687) that's the
  // plugin cache path, not the project. A loud throw forces the operator to
  // fix the env or pass an explicit cwd, instead of linting the wrong tree.
  it('throws ProjectRootNotFoundError loudly when nothing is found', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wp-pr-empty-'))
    expect(() => resolveProjectRoot({ env: {}, cwd: dir })).toThrow(ProjectRootNotFoundError)
  })

  it('explicitCwd short-circuits all other resolution', () => {
    expect(
      resolveProjectRoot({
        explicitCwd: '/explicit',
        env: { CLAUDE_PROJECT_DIR: '/from-env' },
        cwd: '/from-walk',
      }),
    ).toBe('/explicit')
  })

  // Regression: a caller-supplied cwd that anchors at a real project root must
  // outrank the ambient CLAUDE_PROJECT_DIR. For a plugin-scope MCP server,
  // CLAUDE_PROJECT_DIR is the whole session/workspace root, so without this
  // precedence `wp_lint`/`wp_test` given an explicit target repo scanned every
  // sibling repo under the workspace root instead of the requested project.
  it('an explicit cwd that resolves to a project marker outranks CLAUDE_PROJECT_DIR', () => {
    const envRoot = mkdtempSync(join(tmpdir(), 'wp-pr-env-root-'))
    const cwdRoot = mkdtempSync(join(tmpdir(), 'wp-pr-cwd-root-'))
    writeFileSync(join(cwdRoot, 'pnpm-workspace.yaml'), '')
    const nested = join(cwdRoot, 'apps', 'site')
    mkdirSync(nested, { recursive: true })
    expect(
      resolveProjectRoot({ env: { CLAUDE_PROJECT_DIR: envRoot }, cwd: nested }),
    ).toBe(cwdRoot)
  })

  // Boundary: an explicit cwd with no marker of its own still defers to
  // CLAUDE_PROJECT_DIR (it does not fall through to process.cwd()).
  it('an explicit cwd with no marker falls back to CLAUDE_PROJECT_DIR', () => {
    const envRoot = mkdtempSync(join(tmpdir(), 'wp-pr-env-fallback-'))
    const bare = mkdtempSync(join(tmpdir(), 'wp-pr-bare-cwd-'))
    expect(resolveProjectRoot({ env: { CLAUDE_PROJECT_DIR: envRoot }, cwd: bare })).toBe(envRoot)
  })
})
