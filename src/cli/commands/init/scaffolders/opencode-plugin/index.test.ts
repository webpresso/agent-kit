import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

import {
  OPENCODE_PLUGIN_CONTENT,
  OPENCODE_PLUGIN_RELATIVE_PATH,
  scaffoldOpencodePlugin,
} from './index'

const tempRoots: string[] = []
function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'opencode-plugin-scaffolder-'))
  tempRoots.push(root)
  return root
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('scaffoldOpencodePlugin', () => {
  it('creates the plugin file under .opencode/plugins on first run', () => {
    const repoRoot = createTempRoot()
    const result = scaffoldOpencodePlugin({ repoRoot, options: {} })

    expect(result.action).toBe('created')
    const targetPath = join(repoRoot, OPENCODE_PLUGIN_RELATIVE_PATH)
    expect(result.targetPath).toBe(targetPath)
    expect(readFileSync(targetPath, 'utf8')).toBe(OPENCODE_PLUGIN_CONTENT)
  })

  it('is idempotent — re-running on identical content returns identical', () => {
    const repoRoot = createTempRoot()
    scaffoldOpencodePlugin({ repoRoot, options: {} })
    const second = scaffoldOpencodePlugin({ repoRoot, options: {} })

    expect(second.action).toBe('identical')
  })

  it('refreshes the generated plugin when local content has drifted', () => {
    const repoRoot = createTempRoot()
    const targetPath = join(repoRoot, OPENCODE_PLUGIN_RELATIVE_PATH)
    mkdirSync(join(repoRoot, '.opencode/plugins'), { recursive: true })
    writeFileSync(targetPath, '// consumer custom content\n', 'utf8')

    const result = scaffoldOpencodePlugin({ repoRoot, options: {} })

    expect(result.action).toBe('overwritten')
    expect(readFileSync(targetPath, 'utf8')).toBe(OPENCODE_PLUGIN_CONTENT)
    expect(() => readFileSync(`${targetPath}.new`, 'utf8')).toThrow()
  })

  it('overwrites consumer content when --overwrite is set', () => {
    const repoRoot = createTempRoot()
    const targetPath = join(repoRoot, OPENCODE_PLUGIN_RELATIVE_PATH)
    mkdirSync(join(repoRoot, '.opencode/plugins'), { recursive: true })
    writeFileSync(targetPath, '// consumer custom content\n', 'utf8')

    const result = scaffoldOpencodePlugin({ repoRoot, options: { overwrite: true } })

    expect(result.action).toBe('overwritten')
    expect(readFileSync(targetPath, 'utf8')).toBe(OPENCODE_PLUGIN_CONTENT)
  })

  it('skips writes in --dry-run mode', () => {
    const repoRoot = createTempRoot()
    const result = scaffoldOpencodePlugin({ repoRoot, options: { dryRun: true } })

    expect(result.action).toBe('skipped-dry')
    const targetPath = join(repoRoot, OPENCODE_PLUGIN_RELATIVE_PATH)
    expect(() => readFileSync(targetPath, 'utf8')).toThrow()
  })
})

describe('plugin-native invariants — webpresso-dev-link.js', () => {
  it('scaffolder produces byte-identical output on first and second run', () => {
    const repoRoot = createTempRoot()
    const targetPath = join(repoRoot, OPENCODE_PLUGIN_RELATIVE_PATH)

    scaffoldOpencodePlugin({ repoRoot, options: {} })
    const firstContent = readFileSync(targetPath, 'utf8')

    scaffoldOpencodePlugin({ repoRoot, options: {} })
    const secondContent = readFileSync(targetPath, 'utf8')

    expect(firstContent).toStrictEqual(OPENCODE_PLUGIN_CONTENT)
    expect(secondContent).toStrictEqual(OPENCODE_PLUGIN_CONTENT)
  })
})

describe('OPENCODE_PLUGIN_CONTENT', () => {
  it('exports an async plugin function as required by opencode plugin contract', () => {
    expect(OPENCODE_PLUGIN_CONTENT).toContain('export const WebpressoDevLinkPlugin')
    expect(OPENCODE_PLUGIN_CONTENT).toContain('async ({ $, directory })')
  })

  it('shells out to the webpresso-shipped wp-check-dev-link bin', () => {
    expect(OPENCODE_PLUGIN_CONTENT).toContain('./node_modules/.bin/wp-check-dev-link')
  })

  it('subscribes to session.created for first-run detection', () => {
    expect(OPENCODE_PLUGIN_CONTENT).toContain("event?.type === 'session.created'")
  })

  it('uses experimental.session.compacting for context survival across compaction', () => {
    expect(OPENCODE_PLUGIN_CONTENT).toContain("'experimental.session.compacting'")
    expect(OPENCODE_PLUGIN_CONTENT).toContain('output.context.push(message)')
  })

  it('routes the warning to stderr (visible in opencode TUI)', () => {
    expect(OPENCODE_PLUGIN_CONTENT).toContain('process.stderr.write')
  })

  it('executes as a real plugin and propagates breakage context through session and compaction hooks', async () => {
    const repoRoot = createTempRoot()
    const targetPath = join(repoRoot, OPENCODE_PLUGIN_RELATIVE_PATH)
    scaffoldOpencodePlugin({ repoRoot, options: {} })

    const mod = (await import(`${pathToFileURL(targetPath).href}?t=${Date.now()}`)) as {
      WebpressoDevLinkPlugin: (input: {
        $: (
          strings: TemplateStringsArray,
          ...values: string[]
        ) => {
          cwd: (directory: string) => {
            quiet: () => { nothrow: () => Promise<{ exitCode: number; stdout: Buffer }> }
          }
        }
        directory: string
      }) => Promise<{
        event: (input: { event: { type: string } }) => Promise<void>
        'experimental.session.compacting': (
          _input: unknown,
          output: { context: string[] },
        ) => Promise<void>
      }>
    }

    const $ = (_strings: TemplateStringsArray, ..._values: string[]) => {
      return {
        cwd: (_directory: string) => ({
          quiet: () => ({
            nothrow: async () => {
              return {
                exitCode: 0,
                stdout: Buffer.from(
                  JSON.stringify({
                    hookSpecificOutput: {
                      additionalContext: 'dev-link-broken',
                    },
                  }),
                ),
              }
            },
          }),
        }),
      }
    }

    const plugin = await mod.WebpressoDevLinkPlugin({ $, directory: repoRoot })
    await plugin.event({ event: { type: 'session.created' } })
    const output = { context: [] as string[] }
    await plugin['experimental.session.compacting']({}, output)

    expect(output.context).toContain('dev-link-broken')
  })
})
