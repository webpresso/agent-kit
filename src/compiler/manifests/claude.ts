import { renameSync, writeFileSync } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { MANIFEST_VERSIONS } from './_versions.js'

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
  const pluginDir = join(opts.outDir, '.claude-plugin')
  mkdirSync(pluginDir, { recursive: true })

  const plugin = {
    _generated: 'by webpresso wp compile — do not edit manually',
    name: 'webpresso',
    version: opts.version,
    description: 'Webpresso: blueprint lifecycle, skill compiler, audits for Claude Code',
    author: {
      name: 'Webpresso',
      url: 'https://github.com/webpresso',
    },
    skills: opts.skills.map((name) => ({ path: `skills/${name}/SKILL.md` })),
    mcpServers: {},
    hooks: {},
  }

  writeAtomic(join(pluginDir, 'plugin.json'), JSON.stringify(plugin, null, 2))

  const marketplace = {
    _generated: 'by webpresso wp compile — do not edit manually',
    name: 'webpresso',
    displayName: 'Webpresso',
    description: 'Webpresso: blueprint lifecycle, skill compiler, audits for Claude Code',
    version: opts.version,
    publisher: 'webpresso',
    categories: ['productivity', 'developer-tools'],
    skills: [...opts.skills],
    schemaVersion: MANIFEST_VERSIONS.claude,
  }

  writeAtomic(join(pluginDir, 'marketplace.json'), JSON.stringify(marketplace, null, 2))
}
