/**
 * Plan Markdown Helpers
 *
 * Pure functions for patching markdown plan files.
 * Used by AgentBlueprintContext for task status updates.
 *
 * All functions are idempotent - running them multiple times
 * produces identical output (for the same inputs).
 */

import { escapeRegex } from '#utils/string'

import {
  buildTaskHeaderRegexForId,
  buildTaskSectionBoundaryRegex,
  TASK_HEADING_PREFIX_PATTERN,
} from './task-heading.js'

function buildTaskPattern(taskId: string): RegExp {
  return new RegExp(
    `(####\\s+${TASK_HEADING_PREFIX_PATTERN}Task\\s+${escapeRegex(taskId)}[:\\s].*?)(?=\\n####|\\n###|$)`,
    's',
  )
}

function insertAfterTaskTitle(section: string, line: string): string {
  const titleMatch = section.match(
    new RegExp(`(####\\s+${TASK_HEADING_PREFIX_PATTERN}Task\\s+[^\\n]+\\n+)`),
  )
  if (!titleMatch) {
    return `${section}\n${line}\n`
  }

  return section.replace(titleMatch[0], `${titleMatch[0]}${line}\n\n`)
}

function insertAfterStatusLine(section: string, line: string): string {
  const statusMatch = section.match(/(\*\*Status:\*\*\s*.+\n+)/i)
  if (!statusMatch) {
    return insertAfterTaskTitle(section, line)
  }

  return section.replace(statusMatch[0], `${statusMatch[0]}${line}\n\n`)
}

export function extractCodeBlocks(content: string, language: string): string[] {
  const escapedLanguage = escapeRegex(language)
  const blockPattern = new RegExp(
    '^```\\s*' + escapedLanguage + '\\s*\\n([\\s\\S]*?)\\n```\\s*$',
    'gm',
  )

  return Array.from(content.matchAll(blockPattern), (match) => (match[1] ?? '').trim())
}

export function extractTaskSection(raw: string, taskId: string): string | null {
  const headerPattern = buildTaskHeaderRegexForId(taskId)
  const headerMatch = raw.match(headerPattern)
  if (!headerMatch || headerMatch.index === undefined) return null

  const startIndex = headerMatch.index
  const restOfContent = raw.slice(startIndex + headerMatch[0].length)
  const nextSectionMatch = restOfContent.match(buildTaskSectionBoundaryRegex())

  const endIndex = nextSectionMatch?.index
    ? startIndex + headerMatch[0].length + nextSectionMatch.index
    : raw.length

  return raw.slice(startIndex, endIndex).trim()
}

export function checkFirstCheckbox(content: string, taskId: string): string {
  const taskPattern = buildTaskPattern(taskId)

  return content.replace(taskPattern, (section) => {
    return section.replace(/- \[ \]/, '- [x]')
  })
}

export function checkAllCheckboxes(content: string, taskId: string): string {
  const taskPattern = buildTaskPattern(taskId)

  return content.replace(taskPattern, (section) => {
    return section.replace(/- \[ \]/g, '- [x]')
  })
}

export function completeTask(content: string, taskId: string): string {
  const markedDone = updateTaskStatus(content, taskId, 'done')
  const unblocked = updateBlockedReason(markedDone, taskId, '')
  return checkAllCheckboxes(unblocked, taskId)
}

export function updateBlockedReason(content: string, taskId: string, reason: string): string {
  const taskPattern = buildTaskPattern(taskId)

  return content.replace(taskPattern, (section) => {
    const trimmedReason = reason.trim()
    const blockedPattern = /\n?\*\*Blocked:\*\*\s*.*(?:\n+)?/i

    if (!trimmedReason) {
      return section
        .replace(blockedPattern, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trimEnd()
    }

    const blockedLine = `**Blocked:** ${trimmedReason}`

    if (/\*\*Blocked:\*\*/i.test(section)) {
      return section.replace(/\*\*Blocked:\*\*\s*.+/i, blockedLine)
    }

    return insertAfterStatusLine(section, blockedLine)
  })
}

export function updateTaskStatus(
  content: string,
  taskId: string,
  status: 'todo' | 'in_progress' | 'blocked' | 'done' | 'dropped',
): string {
  const taskPattern = buildTaskPattern(taskId)

  return content.replace(taskPattern, (section) => {
    const statusLine = `**Status:** ${status}`

    if (/\*\*Status:\*\*/i.test(section)) {
      return section.replace(/\*\*Status:\*\*\s*.+/i, statusLine)
    }

    return insertAfterTaskTitle(section, statusLine)
  })
}
