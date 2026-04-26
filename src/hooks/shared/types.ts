export interface ToolInput {
  tool_input?: Record<string, unknown>
}

export interface ValidationResult {
  validator: string
  passed: boolean
  message?: string
  skipped?: boolean
  skipReason?: string
}

export function parseToolInput(json: string): ToolInput {
  return JSON.parse(json) as ToolInput
}

export function isBashInput(input: ToolInput): boolean {
  return 'command' in (input.tool_input || {})
}

export function isFileEditInput(input: ToolInput): boolean {
  const toolInput = input.tool_input || {}
  return 'file_path' in toolInput && 'old_string' in toolInput && 'new_string' in toolInput
}

export function isFileWriteInput(input: ToolInput): boolean {
  const toolInput = input.tool_input || {}
  return 'file_path' in toolInput && 'content' in toolInput
}

export function isFileReadInput(input: ToolInput): boolean {
  const toolInput = input.tool_input || {}
  return 'file_path' in toolInput && !('content' in toolInput) && !('old_string' in toolInput)
}

export function getFilePath(input: ToolInput): string | undefined {
  const toolInput = input.tool_input as Record<string, unknown> | undefined
  if (!toolInput || typeof toolInput !== 'object') return undefined
  const filePath = toolInput.file_path
  return typeof filePath === 'string' ? filePath : undefined
}

export function getCommand(input: ToolInput): string | undefined {
  if (isBashInput(input)) {
    const toolInput = input.tool_input as Record<string, unknown> | undefined
    if (!toolInput || typeof toolInput !== 'object') return undefined
    const command = toolInput.command
    return typeof command === 'string' ? command : undefined
  }
  return undefined
}

export function getContent(input: ToolInput): string | undefined {
  const toolInput = input.tool_input as Record<string, unknown> | undefined
  if (!toolInput || typeof toolInput !== 'object') return undefined
  const content = toolInput.content
  const newString = toolInput.new_string
  if (typeof content === 'string') return content
  if (typeof newString === 'string') return newString
  return undefined
}
