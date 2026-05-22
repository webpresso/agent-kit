import { getErrorMessage } from '#format/errors.js'

import type { AgentTool, FileOperation, ToolContext, ToolResult } from './types.js'

import { isValidRelativePath } from './shared/validate-path.js'

function validatePath(path: string): ToolResult | null {
  if (!isValidRelativePath(path)) {
    return {
      success: false,
      output: 'Invalid path: path traversal not allowed',
      error: 'Path must be relative and cannot contain ".."',
    }
  }
  return null
}

function checkDangerousPatterns(path: string): ToolResult | null {
  const dangerousPatterns = [/\.env$/i, /credentials/i, /secret/i, /\.pem$/i, /\.key$/i]

  for (const pattern of dangerousPatterns) {
    if (pattern.test(path)) {
      return {
        success: false,
        output: `Cannot write to sensitive file: ${path}`,
        error: 'Writing to credential or secret files is not allowed',
      }
    }
  }
  return null
}

async function acquireFileLock(
  storage: NonNullable<ToolContext['storage']>,
  path: string,
  lockerId: string,
): Promise<ToolResult | null> {
  const locked = await storage.lockFile(path, lockerId).catch(() => false)
  if (locked) {
    return null
  }

  const lockInfo = await storage.isLocked(path).catch(() => ({ locked: true }))
  const lockerInfo =
    lockInfo.locked && 'lockerId' in lockInfo && typeof lockInfo.lockerId === 'string'
      ? ` by ${lockInfo.lockerId}`
      : ''
  return {
    success: false,
    output: `File is currently locked${lockerInfo}`,
    error: 'File locked',
  }
}

function handleStagedChange(
  path: string,
  content: string,
  exists: boolean,
  originalContent: string | null,
  context: ToolContext,
): ToolResult {
  if (!context.pendingChanges) {
    return {
      success: false,
      output: 'Pending changes manager not configured',
      error: 'No pending changes manager provided in context',
    }
  }

  const change = exists
    ? context.pendingChanges.addModify(
        path,
        originalContent ?? '',
        content,
        'AI agent proposed change',
      )
    : context.pendingChanges.addCreate(path, content, 'AI agent proposed change')

  return {
    success: true,
    output: exists
      ? `Staged modification: ${path} (${content.split('\n').length} lines)`
      : `Staged creation: ${path} (${content.split('\n').length} lines)`,
    data: {
      path,
      changeId: change.id,
      staged: true,
      created: !exists,
    },
  }
}

function performFileWrite(
  path: string,
  content: string,
  exists: boolean,
  originalContent: string | null,
  context: ToolContext,
  toolCallId: string,
): ToolResult {
  const lineCount = content.split('\n').length
  const byteSize = new TextEncoder().encode(content).length
  const operation: FileOperation = exists ? 'modify' : 'create'

  if (context.changeTracker) {
    context.changeTracker.recordChange({
      path,
      before: originalContent,
      after: content,
      operation,
      toolCallId,
    })
  }

  return {
    success: true,
    output: exists
      ? `Updated file: ${path} (${lineCount} lines, ${byteSize} bytes)`
      : `Created file: ${path} (${lineCount} lines, ${byteSize} bytes)`,
    data: { path, lineCount, byteSize, created: !exists },
  }
}

function validateInputs(path: string, context: ToolContext): ToolResult | null {
  const pathCheck = validatePath(path)
  if (pathCheck) return pathCheck

  const dangerousCheck = checkDangerousPatterns(path)
  if (dangerousCheck) return dangerousCheck

  if (!context.storage) {
    return {
      success: false,
      output: 'Storage adapter not configured',
      error: 'No storage adapter provided in context',
    }
  }

  return null
}

function handleWriteError(error: unknown): ToolResult {
  const message = getErrorMessage(error)
  return {
    success: false,
    output: `Failed to write file: ${message}`,
    error: message,
  }
}

async function executeFileWrite(
  path: string,
  content: string,
  storage: NonNullable<ToolContext['storage']>,
  context: ToolContext,
): Promise<ToolResult> {
  const exists = await storage.exists(path)
  const originalContent = exists ? await storage.readFile(path) : null

  if (context.pendingChanges) {
    return handleStagedChange(path, content, exists, originalContent, context)
  }

  await storage.writeFile(path, content)
  const toolCallId = context.toolCallId ?? 'unknown'
  return performFileWrite(path, content, exists, originalContent, context, toolCallId)
}

export const writeFileTool: AgentTool = {
  name: 'write_file',
  description:
    'Write content to a file at the specified path. Creates the file if it does not exist, or overwrites if it does. Use this to create new files or completely replace existing ones.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'The relative path to the file to write (e.g., "src/utils/helper.ts")',
      },
      content: {
        type: 'string',
        description: 'The full content to write to the file',
      },
    },
    required: ['path', 'content'],
  },
  async execute(input, context) {
    const path = input.path as string
    const content = input.content as string
    const lockerId = context.lockerId ?? context.userId ?? 'ai-agent'

    const validationError = validateInputs(path, context)
    if (validationError) return validationError

    if (!context.storage) {
      return {
        success: false,
        output: 'Storage adapter not configured',
        error: 'No storage adapter provided in context',
      }
    }

    const lockError = await acquireFileLock(context.storage, path, lockerId)
    if (lockError) return lockError

    try {
      return await executeFileWrite(path, content, context.storage, context)
    } catch (error) {
      return handleWriteError(error)
    } finally {
      await context.storage.unlockFile(path, lockerId).catch(() => {})
    }
  },
}
