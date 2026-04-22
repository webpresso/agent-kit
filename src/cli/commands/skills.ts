/**
 * `ak skills list|install|refresh` — manage agent skills against the
 * bundled catalog at `<packageRoot>/catalog/agent/skills/`.
 *
 *   list                        Enumerate bundled catalog skills.
 *   list --installed            Enumerate skills present at <cwd>/.agent/skills.
 *   install <name>              Copy a catalog skill into <cwd>/.agent/skills.
 *   refresh [--source <ref>]    Placeholder for upstream registry refresh.
 *
 * The bundled catalog ships inside this package's `catalog/` directory and
 * is enumerated lazily — empty catalog is reported, not an error.
 */

import type { CAC } from 'cac'

import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

interface SkillsListOptions {
  installed?: boolean
}

interface SkillsRefreshOptions {
  source?: string
}

/**
 * Resolve the bundled catalog/agent/skills directory.
 *
 * Source layout: `src/cli/commands/skills.ts` → `../../../catalog/agent/skills/`
 * Bundled layout: `dist/cli.js` → `../catalog/agent/skills/`
 *
 * Walk upward from the current module until we find a `catalog/agent/skills`
 * directory. This works for both layouts without hard-coding `..` counts.
 */
function resolveCatalogSkillsDir(): string {
  let dir = path.dirname(new URL(import.meta.url).pathname)
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'catalog', 'agent', 'skills')
    if (existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  // Fall back to a conventional path under cwd; lets `ak skills list` print
  // a clean "no skills" message rather than throw at startup.
  return path.join(process.cwd(), 'catalog', 'agent', 'skills')
}

function listSkillDirectories(root: string): string[] {
  if (!existsSync(root)) return []
  try {
    return readdirSync(root)
      .filter((name) => !name.startsWith('.'))
      .filter((name) => {
        try {
          return statSync(path.join(root, name)).isDirectory()
        } catch {
          return false
        }
      })
      .toSorted()
  } catch {
    return []
  }
}

function installedSkillsDir(): string {
  return path.join(process.cwd(), '.agent', 'skills')
}

function printSkillsList(skills: string[], header: string): void {
  console.log(header)
  if (!skills.length) {
    console.log('  (none)')
    return
  }
  for (const skill of skills) {
    console.log(`  ${skill}`)
  }
}

export function registerSkillsCommand(cli: CAC): void {
  cli
    .command('skills <action> [name]', 'Manage agent skills (list|install|refresh)')
    .option('--installed', 'List skills installed under <cwd>/.agent/skills (with `list`)')
    .option('--source <ref>', 'Upstream source for refresh (e.g. github:org/repo)')
    .action(
      async (
        action: string,
        name: string | undefined,
        options: SkillsListOptions & SkillsRefreshOptions,
      ) => {
        switch (action) {
          case 'list': {
            if (options.installed) {
              const dir = installedSkillsDir()
              printSkillsList(listSkillDirectories(dir), `Installed skills (${dir}):`)
              return
            }
            const dir = resolveCatalogSkillsDir()
            printSkillsList(listSkillDirectories(dir), `Bundled catalog skills (${dir}):`)
            return
          }
          case 'install': {
            if (!name) {
              console.error('Usage: ak skills install <name>')
              process.exit(1)
            }
            const catalogDir = resolveCatalogSkillsDir()
            const source = path.join(catalogDir, name)
            if (!existsSync(source)) {
              console.error(
                `Skill not found in bundled catalog: ${name}\nTried: ${source}\n` +
                  `Run \`ak skills list\` to see available skills.`,
              )
              process.exit(1)
            }
            const targetRoot = installedSkillsDir()
            const target = path.join(targetRoot, name)
            mkdirSync(targetRoot, { recursive: true })
            cpSync(source, target, { recursive: true })
            console.log(`Installed skill ${name} → ${target}`)
            return
          }
          case 'refresh': {
            const sourceLabel = options.source ?? '<bundled catalog>'
            console.log(
              `ak skills refresh: upstream refresh not yet wired (source=${sourceLabel}).\n` +
                'Skills currently ship with the agent-kit package; pull a newer release of\n' +
                '@webpresso/agent-kit to refresh the bundled catalog.',
            )
            process.exit(0)
          }
          default: {
            console.error(`Unknown skills action: ${action}. Use 'list', 'install', or 'refresh'.`)
            process.exit(1)
          }
        }
      },
    )
}
