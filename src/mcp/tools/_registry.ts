import type { ToolDescriptor } from '#mcp/auto-discover'

import audit from './audit.js'
import ciAct from './ci-act.js'
import e2e from './e2e.js'
import format from './format.js'
import lint from './lint.js'
import qa from './qa.js'
import sessionBatchExecute from './session-batch-execute.js'
import sessionCapture from './session-capture.js'
import sessionExecute from './session-execute.js'
import sessionRestore from './session-restore.js'
import sessionSearch from './session-search.js'
import sessionSnapshot from './session-snapshot.js'
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
  sessionBatchExecute,
  sessionCapture,
  sessionExecute,
  sessionRestore,
  sessionSearch,
  sessionSnapshot,
  test,
  typecheck,
  workerTail,
]
