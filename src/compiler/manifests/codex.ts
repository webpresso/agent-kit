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
    _generated: 'by webpresso wp compile — do not edit manually',
    name: 'webpresso',
    version: opts.version,
    description: 'Webpresso: blueprint lifecycle, skill compiler, audits for Claude Code',
    skills: opts.skills.map((name) => ({ path: `skills/${name}/SKILL.md` })),
    hooks: {},
    apps: [],
  }

  writeAtomic(join(pluginDir, 'plugin.json'), JSON.stringify(plugin, null, 2))
}
