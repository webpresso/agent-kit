import { renameSync, writeFileSync } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

export interface ManifestEmitOptions {
  readonly agentDir: string
  readonly outDir: string
  readonly version: string
  readonly skills: readonly string[]
  readonly commands: readonly string[]
}

function writeAtomic(filePath: string, content: string): void {
  const tmp = `${filePath}.tmp`
  writeFileSync(tmp, content, 'utf-8')
  renameSync(tmp, filePath)
}

export async function emitManifest(opts: ManifestEmitOptions): Promise<void> {
  const pluginDir = join(opts.outDir, '.codex-plugin')
  mkdirSync(pluginDir, { recursive: true })

  const plugin = {
    _generated: 'by agent-kit wp compile — do not edit manually',
    name: '@webpresso/agent-kit',
    version: opts.version,
    description: 'Agent-kit: blueprint lifecycle, skill compiler, audits for Claude Code',
    skills: opts.skills.map((name) => ({ path: `skills/${name}/SKILL.md` })),
    hooks: {},
    apps: [],
  }

  writeAtomic(join(pluginDir, 'plugin.json'), JSON.stringify(plugin, null, 2))
}
