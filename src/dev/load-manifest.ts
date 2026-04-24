import matter from 'gray-matter'
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

export type AkDevMode = 'start' | 'doctor' | 'clean' | 'restart'

export interface AkDevService {
  id: string
  command: string
  args: string[]
  cwd?: string
  env: Record<string, string>
  dependsOn: string[]
  readiness?: unknown
  restart?: unknown
}

export interface AkDevManifest {
  version: 1
  services: Record<string, AkDevService>
  groups: Record<string, { services: string[]; description?: string }>
  defaults: { target?: string }
}

export interface ResolveManifestInput {
  cwd?: string
  manifestPath?: string
  env?: NodeJS.ProcessEnv
}

export interface ResolvedManifest {
  manifestPath: string
  manifest: AkDevManifest
}

export function resolveManifestPath(input: ResolveManifestInput = {}): string {
  const cwd = input.cwd ?? process.cwd()
  const env = input.env ?? process.env
  const candidates = [
    input.manifestPath,
    env.AK_APP_MANIFEST,
    join(cwd, 'app-manifest.yaml'),
  ].filter((candidate): candidate is string => Boolean(candidate))

  for (const candidate of candidates) {
    const absolute = isAbsolute(candidate) ? candidate : resolve(cwd, candidate)
    if (existsSync(absolute)) return absolute
  }

  throw new Error(
    'Unable to find dev manifest. Checked --manifest, AK_APP_MANIFEST, and ./app-manifest.yaml.',
  )
}

export function loadDevManifest(input: ResolveManifestInput = {}): ResolvedManifest {
  const manifestPath = resolveManifestPath(input)
  const raw = readFileSync(manifestPath, 'utf-8')
  const parsed = parseManifestContent(raw, manifestPath)
  return {
    manifestPath,
    manifest: normalizeManifest(parsed),
  }
}

export function resolveDevServices(
  manifest: AkDevManifest,
  target = manifest.defaults.target,
): string[] {
  if (!target) {
    throw new Error('No dev target supplied and defaults.target is not configured')
  }

  const roots =
    manifest.groups[target]?.services ?? (manifest.services[target] ? [target] : undefined)
  if (!roots) {
    throw new Error(
      `Unknown dev target "${target}". Known services: ${Object.keys(manifest.services).join(', ')}. Known groups: ${Object.keys(manifest.groups).join(', ')}.`,
    )
  }

  const out: string[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()

  function visit(id: string, stack: string[]): void {
    if (visited.has(id)) return
    if (visiting.has(id)) {
      const cycleStart = stack.indexOf(id)
      throw new Error(
        `Cyclic dev service dependency detected: ${[...stack.slice(cycleStart), id].join(' -> ')}`,
      )
    }
    const service = manifest.services[id]
    if (!service) throw new Error(`Unknown dev service "${id}"`)
    visiting.add(id)
    for (const dependency of service.dependsOn) {
      visit(dependency, [...stack, id])
    }
    visiting.delete(id)
    visited.add(id)
    out.push(id)
  }

  for (const root of roots) visit(root, [])
  return out
}

function parseManifestContent(raw: string, manifestPath: string): unknown {
  if (manifestPath.endsWith('.json')) {
    return JSON.parse(raw) as unknown
  }

  return matter(`---\n${raw}\n---\n`).data
}

function normalizeManifest(raw: unknown): AkDevManifest {
  const input = assertRecord(raw, 'dev manifest')
  if (input.version !== 1) throw new Error('dev manifest version must be 1')

  const rawServices = assertRecord(input.services, 'services')
  const services: Record<string, AkDevService> = {}
  for (const [id, serviceRaw] of Object.entries(rawServices)) {
    const service = assertRecord(serviceRaw, `services.${id}`)
    const command = normalizeCommand(service, `services.${id}`)
    services[id] = {
      id,
      command: command.command,
      args: command.args ?? assertStringArray(service.args ?? [], `services.${id}.args`),
      env: service.env ? normalizeEnvRecord(service.env, `services.${id}.env`) : {},
      dependsOn: assertStringArray(service.dependsOn ?? [], `services.${id}.dependsOn`),
      ...((command.cwd ?? service.cwd)
        ? { cwd: assertString(command.cwd ?? service.cwd, `services.${id}.cwd`) }
        : {}),
      ...(service.readiness ? { readiness: service.readiness } : {}),
      ...(service.restart ? { restart: service.restart } : {}),
    }
  }

  for (const [id, service] of Object.entries(services)) {
    for (const dependency of service.dependsOn) {
      if (!services[dependency]) {
        throw new Error(`services.${id}.dependsOn references unknown service "${dependency}"`)
      }
    }
  }

  const groups: AkDevManifest['groups'] = {}
  const rawGroups = input.groups ? assertRecord(input.groups, 'groups') : {}
  for (const [id, groupRaw] of Object.entries(rawGroups)) {
    const group = assertRecord(groupRaw, `groups.${id}`)
    const groupServices = assertStringArray(group.services, `groups.${id}.services`)
    for (const serviceId of groupServices) {
      if (!services[serviceId]) {
        throw new Error(`groups.${id}.services references unknown service "${serviceId}"`)
      }
    }
    groups[id] = {
      services: groupServices,
      ...(group.description
        ? { description: assertString(group.description, `groups.${id}.description`) }
        : {}),
    }
  }

  const defaultsRaw = input.defaults ? assertRecord(input.defaults, 'defaults') : {}
  const target = defaultsRaw.target
    ? assertString(defaultsRaw.target, 'defaults.target')
    : undefined

  if (target && !services[target] && !groups[target]) {
    throw new Error(`defaults.target references unknown target "${target}"`)
  }

  return {
    version: 1,
    services,
    groups,
    defaults: target ? { target } : {},
  }
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function assertString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${label} must be a non-empty string`)
  }
  return value
}

function assertStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array of strings`)
  return value.map((entry, index) => assertString(entry, `${label}[${index}]`))
}

function normalizeEnvRecord(value: unknown, label: string): Record<string, string> {
  const record = assertRecord(value, label)
  const out: Record<string, string> = {}
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry === 'string' && entry.trim() !== '') {
      out[key] = entry
    }
  }
  return out
}

function normalizeCommand(
  service: Record<string, unknown>,
  label: string,
): { command: string; args?: string[]; cwd?: string } {
  if (typeof service.command === 'string' && service.command.trim() !== '') {
    return { command: service.command }
  }

  if (service.command && typeof service.command === 'object' && !Array.isArray(service.command)) {
    const commandConfig = service.command as Record<string, unknown>
    const kind = typeof commandConfig.kind === 'string' ? commandConfig.kind : undefined
    const packageName =
      typeof service.package === 'string' && service.package.trim() !== ''
        ? service.package
        : undefined
    const cwd =
      typeof service.cwd === 'string' && service.cwd.trim() !== '' ? service.cwd : undefined

    if (kind === 'package-dev' && packageName) {
      return {
        command: 'pnpm',
        args: ['--filter', packageName, 'run', 'dev'],
        ...(cwd ? { cwd } : {}),
      }
    }

    if (kind === 'wrangler-dev') {
      return {
        command: 'wrangler',
        args: ['dev'],
        ...(cwd ? { cwd } : {}),
      }
    }
  }

  throw new TypeError(`${label}.command must be a non-empty string`)
}
