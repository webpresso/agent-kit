#!/usr/bin/env bun
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

const CONSUMERS_PATH = 'catalog/agent/harness-gate/consumers.yaml'
const SURFACES_PATH = 'catalog/agent/harness-surfaces.yaml'

const consumerSchema = z.object({
  id: z.string(),
  repo: z.string(),
  worktreeAlias: z.string(),
  suiteManifest: z.string(),
  harnessSurfaces: z.array(z.string()),
  heldInSuites: z.array(z.string()),
  heldOutSuites: z.array(z.string()),
})
const consumersSchema = z.object({ version: z.literal(1), consumers: z.array(consumerSchema) })
const suiteSchema = z.object({
  id: z.string(),
  tier: z.enum(['held-in', 'held-out']),
  command: z.string(),
  surfaces: z.array(z.string()),
  proof: z.string(),
})
const suitesSchema = z.object({
  version: z.literal(1),
  consumer: z.string(),
  suites: z.array(suiteSchema),
})
const surfacesSchema = z.object({
  version: z.literal(1),
  surfaces: z.array(
    z.object({ id: z.string(), paths: z.array(z.string()), evidence: z.array(z.string()) }),
  ),
})

export type HarnessGateConsumer = z.infer<typeof consumerSchema>
export type HarnessGateSuite = z.infer<typeof suiteSchema>
export interface HarnessGatePlanSuite extends HarnessGateSuite {
  consumer: string
  suiteSource: 'manifest' | 'synthetic'
}
export interface HarnessGatePlan {
  consumers: HarnessGateConsumer[]
  suites: HarnessGatePlanSuite[]
}
export interface HarnessGateVerdict {
  ok: boolean
  mode: 'planned-only' | 'executed'
  plannedOnly: boolean
  manifestBacked: boolean
  triggeredSurfaces: string[]
  suites: Array<
    HarnessGatePlanSuite & { status: 'passed' | 'failed' | 'planned'; exitCode?: number }
  >
}

export function loadHarnessGatePlan(rootDirectory: string = process.cwd()): HarnessGatePlan {
  const root = resolve(rootDirectory)
  const consumers = consumersSchema.parse(
    parseYaml(readFileSync(join(root, CONSUMERS_PATH), 'utf8')),
  )
  const suites: HarnessGatePlanSuite[] = []
  for (const consumer of consumers.consumers) {
    const consumerRoot = resolveConsumerRoot(root, consumer)
    const suiteManifestPath = join(consumerRoot, consumer.suiteManifest)
    if (!existsSync(suiteManifestPath)) {
      suites.push(...synthesizeExternalSuites(consumer))
      continue
    }
    const manifest = suitesSchema.parse(parseYaml(readFileSync(suiteManifestPath, 'utf8')))
    if (manifest.consumer !== consumer.id) {
      throw new Error(`${consumer.id} manifest declares consumer ${manifest.consumer}`)
    }
    const declaredSuiteIds = new Set(manifest.suites.map((suite) => suite.id))
    for (const suiteId of [...consumer.heldInSuites, ...consumer.heldOutSuites]) {
      if (!declaredSuiteIds.has(suiteId)) throw new Error(`${consumer.id} missing suite ${suiteId}`)
    }
    suites.push(
      ...manifest.suites.map((suite) => ({
        ...suite,
        consumer: consumer.id,
        suiteSource: 'manifest' as const,
      })),
    )
  }
  return { consumers: consumers.consumers, suites }
}

export function detectTriggeredSurfaces(
  changedFiles: readonly string[],
  rootDirectory: string = process.cwd(),
): string[] {
  const root = resolve(rootDirectory)
  const manifest = surfacesSchema.parse(parseYaml(readFileSync(join(root, SURFACES_PATH), 'utf8')))
  const triggered = new Set<string>()
  for (const surface of manifest.surfaces) {
    const prefixes = [...surface.paths, ...surface.evidence]
    if (
      changedFiles.some((file) =>
        prefixes.some((prefix) => file === prefix || file.startsWith(`${prefix}/`)),
      )
    ) {
      triggered.add(surface.id)
    }
  }
  return [...triggered].sort()
}

export function buildHarnessGateVerdict(input: {
  plan: HarnessGatePlan
  triggeredSurfaces: readonly string[]
  execute?: boolean
  rootDirectory?: string
}): HarnessGateVerdict {
  const triggered = new Set(input.triggeredSurfaces)
  const selected = input.plan.suites.filter((suite) =>
    suite.surfaces.some((surface) => triggered.has(surface)),
  )
  const suites = selected.map((suite) => {
    if (!input.execute) return { ...suite, status: 'planned' as const }
    const consumer = input.plan.consumers.find((entry) => entry.id === suite.consumer)
    if (!consumer) return { ...suite, status: 'failed' as const, exitCode: 1 }
    const result = spawnSync(suite.command, {
      cwd: resolveConsumerRoot(input.rootDirectory ?? process.cwd(), consumer),
      shell: true,
      stdio: 'inherit',
    })
    const exitCode = result.status ?? 1
    return {
      ...suite,
      status: exitCode === 0 ? ('passed' as const) : ('failed' as const),
      exitCode,
    }
  })
  const plannedOnly = !input.execute
  return {
    ok: suites.every((suite) => suite.status !== 'failed'),
    mode: plannedOnly ? 'planned-only' : 'executed',
    plannedOnly,
    manifestBacked: suites.every((suite) => suite.suiteSource === 'manifest'),
    triggeredSurfaces: [...triggered].sort(),
    suites,
  }
}

function synthesizeExternalSuites(consumer: HarnessGateConsumer): HarnessGatePlanSuite[] {
  const synthesize = (id: string, tier: 'held-in' | 'held-out'): HarnessGatePlanSuite => ({
    id,
    tier,
    command: '(external consumer manifest unavailable)',
    surfaces: consumer.harnessSurfaces,
    proof: `External manifest ${consumer.suiteManifest} for ${consumer.id} was unavailable; planned verdict only.`,
    consumer: consumer.id,
    suiteSource: 'synthetic',
  })
  return [
    ...consumer.heldInSuites.map((id) => synthesize(id, 'held-in')),
    ...consumer.heldOutSuites.map((id) => synthesize(id, 'held-out')),
  ]
}

function resolveConsumerRoot(root: string, consumer: HarnessGateConsumer): string {
  const envName = `HARNESS_GATE_${consumer.id.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_ROOT`
  const fromEnv = process.env[envName]
  if (fromEnv) return resolve(fromEnv)
  return resolve(root, '..', consumer.worktreeAlias)
}

function parseArgs(argv: string[]): { execute: boolean; json: boolean; changedFiles: string[] } {
  const changedFiles: string[] = []
  let execute = false
  let json = false
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--execute') execute = true
    else if (arg === '--json') json = true
    else if (arg === '--changed-file') {
      const value = argv[index + 1]
      if (!value) throw new Error('--changed-file requires a value')
      changedFiles.push(value)
      index += 1
    } else if (arg?.startsWith('--changed-file=')) {
      changedFiles.push(arg.slice('--changed-file='.length))
    }
  }
  return { execute, json, changedFiles }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2))
  const plan = loadHarnessGatePlan(process.cwd())
  const changedFiles =
    args.changedFiles.length > 0 ? args.changedFiles : [CONSUMERS_PATH, SURFACES_PATH]
  const triggeredSurfaces = detectTriggeredSurfaces(changedFiles, process.cwd())
  const verdict = buildHarnessGateVerdict({ plan, triggeredSurfaces, execute: args.execute })
  if (args.json) console.log(JSON.stringify(verdict, null, 2))
  else {
    console.log(`Harness gate: ${verdict.ok ? 'OK' : 'FAILED'}`)
    console.log(`Mode: ${verdict.mode}`)
    console.log(`Manifest-backed suites: ${verdict.manifestBacked ? 'yes' : 'no'}`)
    console.log(`Triggered surfaces: ${verdict.triggeredSurfaces.join(', ') || '(none)'}`)
    for (const suite of verdict.suites)
      console.log(`- ${suite.id}: ${suite.status} (${suite.suiteSource})`)
  }
  process.exit(verdict.ok ? 0 : 1)
}
