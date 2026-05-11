import { getErrorMessage } from '@webpresso/runtime-format/errors'
import { formatBytes } from '@webpresso/runtime-format/format'

import type { AgentTool } from './types.js'

import { isValidRelativePath } from './shared/validate-path.js'

export const listFilesTool: AgentTool = {
  name: 'list_files',
  description:
    'List files and directories at the specified path. Returns a list of file/directory names. Use this to explore the project structure.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description:
          'The relative path to the directory to list (e.g., "src" or "src/components"). Use "" or "." for root.',
      },
      recursive: {
        type: 'boolean',
        description: 'If true, recursively list all files in subdirectories. Defaults to false.',
      },
      pattern: {
        type: 'string',
        description: 'Optional glob pattern to filter files (e.g., "*.ts" or "**/*.test.ts")',
      },
    },
    required: ['path'],
  },
  async execute(input, context) {
    const validationError = validateListInput(input, context)
    if (validationError) return validationError

    if (!context.storage) {
      return {
        success: false,
        output: 'Storage adapter not configured',
        error: 'No storage adapter provided in context',
      }
    }

    const path = (input.path as string) || '.'
    const recursive = (input.recursive as boolean) ?? false
    const pattern = input.pattern as string | undefined

    try {
      const normalizedPath = path === '.' ? '' : path
      const files = await context.storage.listFiles(normalizedPath, { recursive, pattern })

      return formatListResult(path, files)
    } catch (error) {
      const message = getErrorMessage(error)
      return {
        success: false,
        output: `Failed to list files: ${message}`,
        error: message,
      }
    }
  },
}

function validateListInput(input: Record<string, unknown>, context: { storage?: unknown }) {
  const path = (input.path as string) || '.'

  if (!isValidRelativePath(path)) {
    return {
      success: false,
      output: 'Invalid path: path traversal not allowed',
      error: 'Path must be relative and cannot contain ".."',
    }
  }

  if (!context.storage) {
    return {
      success: false,
      output: 'Storage adapter not configured',
      error: 'No storage adapter provided in context',
    }
  }

  return null
}

function formatListResult(
  path: string,
  files: Array<{ path: string; type: string; size?: number }>,
) {
  if (!files.length) {
    return {
      success: true,
      output: `Directory "${path}" is empty or does not exist`,
      data: { path, files: [], count: 0 },
    }
  }

  const formatted = files
    .map((f) => {
      const icon = f.type === 'directory' ? '📁' : '📄'
      const size = f.size !== undefined ? ` (${formatBytes(f.size)})` : ''
      return `${icon} ${f.path}${size}`
    })
    .join('\n')

  return {
    success: true,
    output: formatted,
    data: { path, files, count: files.length },
  }
}
