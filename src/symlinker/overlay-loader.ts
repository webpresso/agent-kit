import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

const overlayFileSchema = z.object({
  source: z.string().trim().min(1),
  target: z.string().trim().min(1),
})
const overlayManifestSchema = z.object({
  version: z.literal(1),
  cli: z.string().regex(/^[a-z][a-z0-9-]*$/),
  surfaces: z.array(z.string().trim().min(1)).min(1),
  evidence: z.array(z.string().trim().min(1)).min(1),
  files: z.array(overlayFileSchema).default([]),
})

export type AgentOverlayManifest = z.infer<typeof overlayManifestSchema>
export interface LoadedAgentOverlay extends AgentOverlayManifest {
  manifestPath: string
  rootPath: string
}
export interface AgentOverlayValidationResult {
  ok: boolean
  overlays: LoadedAgentOverlay[]
  violations: Array<{ file?: string; message: string }>
}

export function loadAgentOverlays(rootDirectory: string = process.cwd()): LoadedAgentOverlay[] {
  const root = resolve(rootDirectory)
  const overlaysRoot = join(root, 'agent-overlays')
  if (!existsSync(overlaysRoot)) return []
  const overlays: LoadedAgentOverlay[] = []
  for (const cli of readdirSync(overlaysRoot).sort()) {
    const overlayRoot = join(overlaysRoot, cli)
    const manifestPath = join(overlayRoot, 'manifest.yaml')
    if (!existsSync(manifestPath)) continue
    const manifest = overlayManifestSchema.parse(parseYaml(readFileSync(manifestPath, 'utf8')))
    overlays.push({
      ...manifest,
      manifestPath: relative(root, manifestPath),
      rootPath: relative(root, overlayRoot),
    })
  }
  return overlays
}

export function validateAgentOverlays(
  rootDirectory: string = process.cwd(),
): AgentOverlayValidationResult {
  const root = resolve(rootDirectory)
  const violations: Array<{ file?: string; message: string }> = []
  let overlays: LoadedAgentOverlay[] = []
  try {
    overlays = loadAgentOverlays(root)
  } catch (error) {
    return {
      ok: false,
      overlays: [],
      violations: [{ message: `Invalid overlay manifest: ${formatError(error)}` }],
    }
  }

  const targets = new Map<string, string>()
  for (const overlay of overlays) {
    if (overlay.cli !== overlay.rootPath.split('/').at(-1)) {
      violations.push({
        file: overlay.manifestPath,
        message: `Overlay cli '${overlay.cli}' must match directory name '${overlay.rootPath}'.`,
      })
    }
    for (const evidence of overlay.evidence) {
      const evidencePath = resolve(root, overlay.rootPath, evidence)
      if (!isInside(root, evidencePath) || !existsSync(evidencePath)) {
        violations.push({
          file: overlay.manifestPath,
          message: `${overlay.cli} evidence is missing or outside repo: ${evidence}`,
        })
      }
    }
    for (const file of overlay.files) {
      const sourcePath = resolve(root, overlay.rootPath, file.source)
      if (!isInside(root, sourcePath) || !existsSync(sourcePath)) {
        violations.push({
          file: overlay.manifestPath,
          message: `${overlay.cli} source is missing or outside repo: ${file.source}`,
        })
      }
      if (file.target.startsWith('/') || file.target.includes('..')) {
        violations.push({
          file: overlay.manifestPath,
          message: `${overlay.cli} target must be a repo-relative non-parent path: ${file.target}`,
        })
      }
      const prior = targets.get(file.target)
      if (prior && prior !== overlay.cli) {
        violations.push({
          file: overlay.manifestPath,
          message: `Overlay target collision for ${file.target}: ${prior} and ${overlay.cli}`,
        })
      }
      targets.set(file.target, overlay.cli)
      if (existsSync(resolve(root, 'catalog', 'agent', file.target))) {
        violations.push({
          file: overlay.manifestPath,
          message: `${overlay.cli} target collides with catalog/agent/${file.target}`,
        })
      }
    }
  }

  return { ok: violations.length === 0, overlays, violations }
}

function isInside(root: string, path: string): boolean {
  const rel = relative(root, path)
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith('/'))
}

function formatError(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues.map((issue) => issue.message).join('; ')
  if (error instanceof Error) return error.message
  return String(error)
}
