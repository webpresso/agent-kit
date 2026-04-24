import type { E2eHostAdapter } from './types.js'

export const DEFAULT_HOST_ADAPTER_EXPORT_NAME = 'webpressoE2eHostAdapter'
export const FALLBACK_HOST_ADAPTER_EXPORT_NAMES = [
  DEFAULT_HOST_ADAPTER_EXPORT_NAME,
  'default',
] as const

export function isE2eHostAdapter(value: unknown): value is E2eHostAdapter {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Partial<Record<keyof E2eHostAdapter, unknown>>

  return (
    typeof candidate.listSuites === 'function' &&
    typeof candidate.resolveSuiteId === 'function' &&
    (candidate.resolveSuiteGroup === undefined ||
      typeof candidate.resolveSuiteGroup === 'function') &&
    typeof candidate.normalizeFilePath === 'function' &&
    typeof candidate.resolveSuiteForFile === 'function' &&
    (candidate.buildExecutionPlan === undefined ||
      typeof candidate.buildExecutionPlan === 'function')
  )
}
