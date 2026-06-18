export const RAW_BYTES_BASIS_VALUES = [
  'command_output_total',
  'batch_command_output_total',
  'file_read_buffer',
  'index_accepted_text',
  'fetch_indexed_text',
] as const

export type RawBytesBasis = (typeof RAW_BYTES_BASIS_VALUES)[number]

export const GAIN_PRECISION = 'exact_utf8_bytes_approx_tokens' as const
export type GainPrecision = typeof GAIN_PRECISION

export interface SessionGainTelemetry {
  readonly rawBasisBytes: number
  readonly returnedToolResultBytes: number
  readonly gainBytes: number
  readonly approxTokensSaved: number
  readonly precision: GainPrecision
  readonly rawBytesBasis: RawBytesBasis
}

export interface SessionGainEventInput extends SessionGainTelemetry {
  readonly toolName: string
  readonly createdAt?: string
}

export interface SessionGainToolStats {
  readonly toolName: string
  readonly eventCount: number
  readonly rawBasisBytes: number
  readonly returnedToolResultBytes: number
  readonly gainBytes: number
  readonly approxTokensSaved: number
}

export interface SessionGainStats {
  readonly eventCount: number
  readonly rawBasisBytes: number
  readonly returnedToolResultBytes: number
  readonly gainBytes: number
  readonly approxTokensSaved: number
  readonly byTool: readonly SessionGainToolStats[]
}
