import { isBuiltInProviderType } from '#secrets/providers/registry.js'
import {
  SECRET_SINK_NAMES,
  SECRET_SINK_OPERATIONS,
  type SecretSinkDefinition,
} from '#secrets/sinks/types.js'

export interface DopplerProviderConfig {
  readonly type: 'doppler'
  readonly workspace: string
  readonly workspaceId: string
  readonly project: string
}

export interface InfisicalProviderConfig {
  readonly type: 'infisical'
  readonly projectId: string
  readonly identityId?: string
  readonly projectSlug?: string
}

export type SecretProviderConfig = DopplerProviderConfig | InfisicalProviderConfig

export interface SecretProfileDefinition {
  readonly provider: string
  readonly environment: string
}

export interface SecretsSchema {
  readonly schemaVersion: 1
  readonly providers: Record<string, SecretProviderConfig>
  readonly profiles: Record<string, SecretProfileDefinition>
  readonly sinks: Record<string, SecretSinkDefinition>
}

function assertRecord(value: unknown, detail: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(detail)
  }
  return value as Record<string, unknown>
}

function assertNonEmptyString(value: unknown, detail: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(detail)
  }
  return value
}

function parseProviderConfig(providerId: string, value: unknown): SecretProviderConfig {
  const record = assertRecord(value, `Provider "${providerId}" must be an object.`)
  const type = record.type
  if (!isBuiltInProviderType(type)) {
    throw new Error(`Unsupported secret provider "${String(type)}" for "${providerId}".`)
  }

  switch (type) {
    case 'doppler':
      return {
        type: 'doppler',
        workspace: assertNonEmptyString(
          record.workspace,
          `Provider "${providerId}" requires a non-empty workspace.`,
        ),
        workspaceId: assertNonEmptyString(
          record.workspaceId,
          `Provider "${providerId}" requires a non-empty workspaceId.`,
        ),
        project: assertNonEmptyString(
          record.project,
          `Provider "${providerId}" requires a non-empty project.`,
        ),
      }
    case 'infisical':
      return {
        type: 'infisical',
        projectId: assertNonEmptyString(
          record.projectId,
          `Provider "${providerId}" requires a non-empty projectId.`,
        ),
        ...(typeof record.identityId === 'string' && record.identityId.trim().length > 0
          ? { identityId: record.identityId }
          : {}),
        ...(typeof record.projectSlug === 'string' && record.projectSlug.trim().length > 0
          ? { projectSlug: record.projectSlug }
          : {}),
      }
  }
}

function parseProfiles(value: unknown): Record<string, SecretProfileDefinition> {
  const record = assertRecord(value, 'profiles must be an object.')
  const parsed: Record<string, SecretProfileDefinition> = {}
  for (const [profileId, profileValue] of Object.entries(record)) {
    const profile = assertRecord(profileValue, `Profile "${profileId}" must be an object.`)
    parsed[profileId] = {
      provider: assertNonEmptyString(
        profile.provider,
        `Profile "${profileId}" requires a non-empty provider reference.`,
      ),
      environment: assertNonEmptyString(
        profile.environment,
        `Profile "${profileId}" requires a non-empty environment.`,
      ),
    }
  }
  return parsed
}

function parseSinks(value: unknown): Record<string, SecretSinkDefinition> {
  const record = assertRecord(value, 'sinks must be an object.')
  const parsed: Record<string, SecretSinkDefinition> = {}
  for (const [sinkId, sinkValue] of Object.entries(record)) {
    if (!SECRET_SINK_NAMES.includes(sinkId as (typeof SECRET_SINK_NAMES)[number])) {
      throw new Error(`Unsupported secret sink "${sinkId}".`)
    }
    const sink = assertRecord(sinkValue, `Sink "${sinkId}" must be an object.`)
    const allowedOps = sink.allowedOps
    if (!Array.isArray(allowedOps) || allowedOps.length === 0) {
      throw new Error(`Sink "${sinkId}" requires a non-empty allowedOps array.`)
    }
    parsed[sinkId] = {
      defaultProfile: assertNonEmptyString(
        sink.defaultProfile,
        `Sink "${sinkId}" requires a non-empty defaultProfile.`,
      ),
      allowedOps: allowedOps.map((operation) => {
        if (
          typeof operation !== 'string'
          || !SECRET_SINK_OPERATIONS.includes(operation as (typeof SECRET_SINK_OPERATIONS)[number])
        ) {
          throw new Error(`Sink "${sinkId}" contains unsupported operation "${String(operation)}".`)
        }
        return operation as (typeof SECRET_SINK_OPERATIONS)[number]
      }),
    }
  }
  return parsed
}

export function parseSecretsSchema(input: unknown): SecretsSchema {
  const root = assertRecord(input, 'Secret orchestration config must be an object.')
  if (root.schemaVersion !== 1) {
    throw new Error(`Unsupported schemaVersion "${String(root.schemaVersion)}".`)
  }

  const providersRecord = assertRecord(root.providers, 'providers must be an object.')
  const providers = Object.fromEntries(
    Object.entries(providersRecord).map(([providerId, providerValue]) => [
      providerId,
      parseProviderConfig(providerId, providerValue),
    ]),
  ) as Record<string, SecretProviderConfig>

  const profiles = parseProfiles(root.profiles)
  const sinks = parseSinks(root.sinks)

  for (const [profileId, profile] of Object.entries(profiles)) {
    if (!(profile.provider in providers)) {
      throw new Error(`Profile "${profileId}" references unknown provider "${profile.provider}".`)
    }
  }

  for (const [sinkId, sink] of Object.entries(sinks)) {
    if (!(sink.defaultProfile in profiles)) {
      throw new Error(
        `Sink "${sinkId}" references unknown default profile "${sink.defaultProfile}".`,
      )
    }
  }

  return {
    schemaVersion: 1,
    providers,
    profiles,
    sinks,
  }
}

function redactString(value: string, secrets: readonly string[]): string {
  let next = value
  for (const secret of [...secrets].sort((left, right) => right.length - left.length)) {
    if (!secret) continue
    next = next.split(secret).join('[REDACTED]')
  }
  return next
}

export function redactSecretsValue(value: unknown, secrets: readonly string[]): unknown {
  if (typeof value === 'string') {
    return redactString(value, secrets)
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactSecretsValue(entry, secrets))
  }
  if (!value || typeof value !== 'object') {
    return value
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, redactSecretsValue(entry, secrets)]),
  )
}
