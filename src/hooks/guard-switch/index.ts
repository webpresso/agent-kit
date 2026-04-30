#!/usr/bin/env node
import { readStdinJson, suppressStderr } from '#hooks/shared/hook-bootstrap'
import { setGuardEnabled } from './state.js'

async function main(): Promise<void> {
  suppressStderr()
  const inputJson = await readStdinJson()

  if (!inputJson.trim()) {
    console.log('{}')
    process.exit(0)
  }

  const input = JSON.parse(inputJson) as { prompt: string }
  const normalized = input.prompt.toLowerCase().trim()

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

  console.log('{}')
}

main()
