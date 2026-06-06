#!/usr/bin/env bun
import { runHook } from '#hooks/shared/hook-bootstrap'
import { setGuardEnabled } from './state.js'
import { isDirectEntrypoint } from '#hooks/shared/direct-entrypoint'

export async function main(): Promise<void> {
  await runHook(
    (input) => {
      const normalized = ((input as { prompt?: string }).prompt ?? '').toLowerCase().trim()
      if (normalized === 'guard off') {
        setGuardEnabled(false)
        console.error('🛡️ Guard disabled — pretool validators will be skipped')
        process.exit(2)
      }
      if (normalized === 'guard on') {
        setGuardEnabled(true)
        console.error('🛡️ Guard enabled — pretool validators active')
        process.exit(2)
      }
      return null
    },
    () => '{}',
  )
}

if (
  isDirectEntrypoint(import.meta.url)
) {
  void main()
}
