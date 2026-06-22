export type Sample = {
  readonly metricKey: string
  readonly value: number
  readonly unit: string
}

export const ENVIRONMENTS = ['dry_run', 'live', 'ci'] as const
export type Environment = (typeof ENVIRONMENTS)[number]

export const REDACTION_STATUSES = ['clean', 'pending', 'redacted'] as const
export type RedactionStatus = (typeof REDACTION_STATUSES)[number]

export type Provenance = {
  readonly gitCommit: string
  readonly gitDirty: boolean
  readonly command: string
  readonly environment: Environment
}

export type Threshold = {
  readonly value: number
  readonly unit: string
  readonly pass: boolean
}

export type MeasurementArtifact = {
  readonly schemaVersion: '1'
  readonly runId: string
  readonly manifestDigest: string
  readonly provenance: Provenance
  readonly scenarioSet: string
  readonly variantSet: string
  readonly warmup: number
  readonly repetitions: number
  readonly samples: readonly Sample[]
  readonly aggregates: Record<string, number>
  readonly thresholds: Record<string, Threshold>
  readonly rawArtifactHashes: Record<string, string>
  readonly redactionStatus: RedactionStatus
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateProvenance(raw: unknown): Provenance {
  if (!isRecord(raw)) throw new Error('provenance must be an object')
  if (typeof raw['gitCommit'] !== 'string' || raw['gitCommit'].trim() === '') {
    throw new Error('provenance.gitCommit must be a non-empty string')
  }
  if (typeof raw['gitDirty'] !== 'boolean') {
    throw new Error('provenance.gitDirty must be a boolean')
  }
  if (typeof raw['command'] !== 'string' || raw['command'].trim() === '') {
    throw new Error('provenance.command must be a non-empty string')
  }
  const env = raw['environment']
  if (!ENVIRONMENTS.includes(env as Environment)) {
    throw new Error(`provenance.environment must be one of: ${ENVIRONMENTS.join(', ')}`)
  }
  return {
    gitCommit: raw['gitCommit'],
    gitDirty: raw['gitDirty'],
    command: raw['command'],
    environment: env as Environment,
  }
}

function validateSamples(raw: unknown): readonly Sample[] {
  if (!Array.isArray(raw)) throw new Error('samples must be an array')
  if (raw.length === 0) throw new Error('samples must contain at least one entry')
  return raw.map((item: unknown, i: number) => {
    if (!isRecord(item)) throw new Error(`samples[${i}] must be an object`)
    if (typeof item['metricKey'] !== 'string' || item['metricKey'].trim() === '') {
      throw new Error(`samples[${i}].metricKey must be a non-empty string`)
    }
    if (typeof item['value'] !== 'number') {
      throw new Error(`samples[${i}].value must be a number`)
    }
    if (typeof item['unit'] !== 'string') {
      throw new Error(`samples[${i}].unit must be a string`)
    }
    return {
      metricKey: item['metricKey'],
      value: item['value'],
      unit: item['unit'],
    }
  })
}

function validateStringRecord(raw: unknown, field: string): Record<string, string> {
  if (!isRecord(raw)) throw new Error(`${field} must be an object`)
  const result: Record<string, string> = {}
  for (const [key, val] of Object.entries(raw)) {
    if (typeof val !== 'string') throw new Error(`${field}.${key} must be a string`)
    result[key] = val
  }
  return result
}

function validateNumberRecord(raw: unknown, field: string): Record<string, number> {
  if (!isRecord(raw)) throw new Error(`${field} must be an object`)
  const result: Record<string, number> = {}
  for (const [key, val] of Object.entries(raw)) {
    if (typeof val !== 'number') throw new Error(`${field}.${key} must be a number`)
    result[key] = val
  }
  return result
}

function validateThresholds(raw: unknown): Record<string, Threshold> {
  if (!isRecord(raw)) throw new Error('thresholds must be an object')
  const result: Record<string, Threshold> = {}
  for (const [key, val] of Object.entries(raw)) {
    if (!isRecord(val)) throw new Error(`thresholds.${key} must be an object`)
    if (typeof val['value'] !== 'number')
      throw new Error(`thresholds.${key}.value must be a number`)
    if (typeof val['unit'] !== 'string') throw new Error(`thresholds.${key}.unit must be a string`)
    if (typeof val['pass'] !== 'boolean')
      throw new Error(`thresholds.${key}.pass must be a boolean`)
    result[key] = { value: val['value'], unit: val['unit'], pass: val['pass'] }
  }
  return result
}

export function validateMeasurementArtifact(artifact: unknown): MeasurementArtifact {
  if (!isRecord(artifact)) throw new Error('artifact must be a non-null object')

  if (artifact['schemaVersion'] !== '1') {
    throw new Error("schemaVersion must be '1'")
  }
  if (typeof artifact['runId'] !== 'string' || artifact['runId'].trim() === '') {
    throw new Error('runId must be a non-empty string')
  }
  if (typeof artifact['manifestDigest'] !== 'string' || artifact['manifestDigest'].trim() === '') {
    throw new Error('manifestDigest must be a non-empty string')
  }

  const provenance = validateProvenance(artifact['provenance'])
  const samples = validateSamples(artifact['samples'])

  if (typeof artifact['scenarioSet'] !== 'string') throw new Error('scenarioSet must be a string')
  if (typeof artifact['variantSet'] !== 'string') throw new Error('variantSet must be a string')
  if (typeof artifact['warmup'] !== 'number') throw new Error('warmup must be a number')
  if (typeof artifact['repetitions'] !== 'number') throw new Error('repetitions must be a number')

  const aggregates = validateNumberRecord(artifact['aggregates'], 'aggregates')
  const thresholds = validateThresholds(artifact['thresholds'])

  if (!isRecord(artifact['rawArtifactHashes'])) {
    throw new Error('rawArtifactHashes must be an object')
  }
  const rawArtifactHashes = validateStringRecord(artifact['rawArtifactHashes'], 'rawArtifactHashes')

  const redactionStatus = artifact['redactionStatus']
  if (!REDACTION_STATUSES.includes(redactionStatus as RedactionStatus)) {
    throw new Error(`redactionStatus must be one of: ${REDACTION_STATUSES.join(', ')}`)
  }

  return {
    schemaVersion: '1',
    runId: artifact['runId'],
    manifestDigest: artifact['manifestDigest'],
    provenance,
    scenarioSet: artifact['scenarioSet'],
    variantSet: artifact['variantSet'],
    warmup: artifact['warmup'],
    repetitions: artifact['repetitions'],
    samples,
    aggregates,
    thresholds,
    rawArtifactHashes,
    redactionStatus: redactionStatus as RedactionStatus,
  }
}

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

function stableStringify(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return '[' + value.map((item) => stableStringify(item as JsonValue)).join(',') + ']'
  }
  const sorted = Object.keys(value).sort()
  const pairs = sorted.map((key) => {
    return JSON.stringify(key) + ':' + stableStringify((value as Record<string, JsonValue>)[key])
  })
  return '{' + pairs.join(',') + '}'
}

export function serializeMeasurementArtifact(artifact: MeasurementArtifact): string {
  return stableStringify(artifact as unknown as JsonValue)
}
