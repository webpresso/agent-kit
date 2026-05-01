#!/usr/bin/env bun
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { main as runMain } from './runner.js'

export type { AggregateResult } from './runner.js'
export {
  getTarget,
  getToolType,
  handleParseError,
  logValidationResult,
  main,
  processValidation,
  runAllValidators,
} from './runner.js'
export { VALIDATORS } from './validators/index.js'

if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  runMain()
}
