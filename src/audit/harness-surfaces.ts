import { existsSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

import type { RepoAuditResult, RepoAuditViolation } from './repo-guardrails.js'

export const HARNESS_SURFACES_MANIFEST_PATH = 'catalog/agent/harness-surfaces.yaml'

const surfaceKindSchema = z.enum([
  'hook',
  'generated-surface',
  'runtime-state',
  'regression-gate',
  'overlay',
])
const surfaceLifecycleSchema = z.enum(['locked', 'governed', 'experimental'])

export const harnessSurfaceSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  title: z.string().trim().min(1),
  owner: z.string().trim().min(1),
  kind: surfaceKindSchema,
  lifecycle: surfaceLifecycleSchema,
  paths: z.array(z.string().trim().min(1)).min(1),
  triggers: z.array(z.string().trim().min(1)).min(1),
  evidence: z.array(z.string().trim().min(1)).min(1),
})

export const harnessSurfacesManifestSchema = z.object({
  version: z.literal(1),
  surfaces: z.array(harnessSurfaceSchema).min(1),
})

export type HarnessSurface = z.infer<typeof harnessSurfaceSchema>
export type HarnessSurfacesManifest = z.infer<typeof harnessSurfacesManifestSchema>

export interface ReadHarnessSurfacesOptions {
  manifestPath?: string
}

export function readHarnessSurfacesManifest(
  rootDirectory: string = process.cwd(),
  options: ReadHarnessSurfacesOptions = {},
): HarnessSurfacesManifest {
  const root = resolve(rootDirectory)
  const manifestPath = resolve(root, options.manifestPath ?? HARNESS_SURFACES_MANIFEST_PATH)
  const parsed = parseYaml(readFileSync(manifestPath, 'utf8'))
  return harnessSurfacesManifestSchema.parse(parsed)
}

export function auditHarnessSurfaces(
  rootDirectory: string = process.cwd(),
  options: ReadHarnessSurfacesOptions = {},
): RepoAuditResult {
  const root = resolve(rootDirectory)
  const manifestRelativePath = options.manifestPath ?? HARNESS_SURFACES_MANIFEST_PATH
  const manifestPath = resolve(root, manifestRelativePath)
  const violations: RepoAuditViolation[] = []

  if (!existsSync(manifestPath)) {
    return {
      ok: false,
      title: 'Harness surfaces manifest',
      checked: 0,
      violations: [
        {
          file: manifestRelativePath,
          message: 'Missing canonical harness surface manifest.',
        },
      ],
    }
  }

  let manifest: HarnessSurfacesManifest
  try {
    manifest = readHarnessSurfacesManifest(root, { manifestPath: manifestRelativePath })
  } catch (error) {
    return {
      ok: false,
      title: 'Harness surfaces manifest',
      checked: 1,
      violations: [
        {
          file: manifestRelativePath,
          message: `Invalid harness surface manifest: ${formatError(error)}`,
        },
      ],
    }
  }

  const ids = new Set<string>()
  for (const surface of manifest.surfaces) {
    if (ids.has(surface.id)) {
      violations.push({
        file: manifestRelativePath,
        message: `Duplicate harness surface id: ${surface.id}`,
      })
    }
    ids.add(surface.id)

    for (const surfacePath of surface.paths) {
      const absolutePath = resolve(root, surfacePath)
      const relativePath = relative(root, absolutePath)
      if (relativePath.startsWith('..')) {
        violations.push({
          file: manifestRelativePath,
          message: `${surface.id} references path outside the repo: ${surfacePath}`,
        })
        continue
      }
    }

    for (const evidencePath of surface.evidence) {
      const absolutePath = resolve(root, evidencePath)
      const relativePath = relative(root, absolutePath)
      if (relativePath.startsWith('..')) {
        violations.push({
          file: manifestRelativePath,
          message: `${surface.id} references evidence outside the repo: ${evidencePath}`,
        })
        continue
      }
      if (!existsSync(absolutePath)) {
        violations.push({
          file: manifestRelativePath,
          message: `${surface.id} references missing evidence: ${evidencePath}`,
        })
      }
    }
  }

  const requiredIds = [
    'codex-hooks',
    'claude-hooks',
    'generated-agent-surfaces',
    'omx-runtime-state',
    'harness-regression-gate',
    'agent-overlays',
  ] as const
  for (const requiredId of requiredIds) {
    if (!ids.has(requiredId)) {
      violations.push({
        file: manifestRelativePath,
        message: `Missing required harness surface id: ${requiredId}`,
      })
    }
  }

  return {
    ok: violations.length === 0,
    title: 'Harness surfaces manifest',
    checked: manifest.surfaces.length,
    violations,
  }
}

function formatError(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues.map((issue) => issue.message).join('; ')
  if (error instanceof Error) return error.message
  return String(error)
}
