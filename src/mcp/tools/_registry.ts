import type { ToolDescriptor } from '#mcp/auto-discover'

import audit from './audit.js'
import ciAct from './ci-act.js'
import e2e from './e2e.js'
import format from './format.js'
import lint from './lint.js'
import qa from './qa.js'
import sessionDoctor from './session-doctor.js'
import sessionExecuteFile from './session-execute-file.js'
import sessionFetchAndIndex from './session-fetch-and-index.js'
import sessionIndex from './session-index.js'
import sessionPurge from './session-purge.js'
import sessionRestore from './session-restore.js'
import sessionSearch from './session-search.js'
import sessionStats from './session-stats.js'
import test from './test.js'
import typecheck from './typecheck.js'
import workerTail from './worker-tail.js'

export const COMPILED_TOOL_REGISTRY: readonly ToolDescriptor[] = [
  audit,
  ciAct,
  e2e,
  format,
  lint,
  qa,
  sessionDoctor,
  sessionExecuteFile,
  sessionFetchAndIndex,
  sessionIndex,
  sessionPurge,
  sessionRestore,
  sessionSearch,
  sessionStats,
  test,
  typecheck,
  workerTail,
]
