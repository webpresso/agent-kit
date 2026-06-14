import { readFileSync } from 'node:fs'

import { calculateRecallAt5 } from './recall-policy'

export type TranscriptQrel = {
  question: string
  expected_substring_in_response: string
}

export type TranscriptRecallScore = {
  recall_at_5: number
  matched_qrels: number
  denominator: number
  recall_reason?: string
  recall_error?: string
  scored_response_text?: string
  scored_transcript_path?: string
  scored_event_id?: string
  scored_turn_idx?: number
  scored_line_idx?: number
}

type JsonRecord = Record<string, unknown>

type ExtractedText = {
  text: string
  eventId?: string
  turnIdx?: number
  lineIdx: number
}

function isRecord(value: unknown): value is JsonRecord {
  return Object.prototype.toString.call(value) === '[object Object]'
}

function parseJsonLine(line: string): JsonRecord | undefined {
  try {
    const parsed = JSON.parse(line) as unknown
    return isRecord(parsed) ? parsed : undefined
  } catch {
    // Malformed provider JSONL lines are ignored by design.
  }
}

function normalizeForRecall(value: string): string {
  return value.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ')
}

function textFromContentParts(value: unknown): string | null {
  if (!Array.isArray(value)) return null

  const parts: string[] = []
  for (const part of value) {
    const text = (part as { text?: unknown } | null | undefined)?.text
    if (typeof text !== 'string') continue
    if (!text.trim()) continue
    parts.push(text)
  }

  return parts.join('\n') || null
}

function textFromCodexMessage(value: JsonRecord): string | null {
  if (typeof value.message === 'string' && value.message.trim().length > 0) {
    return value.message
  }

  const nestedMessage = isRecord(value.msg) ? value.msg : null
  if (nestedMessage && typeof nestedMessage.message === 'string' && nestedMessage.message.trim()) {
    return nestedMessage.message
  }

  return null
}

function extractTextFromRecord(record: JsonRecord): string | null {
  const rawMessage = isRecord(record.message) ? record.message : null
  const rawMessageText = rawMessage ? textFromContentParts(rawMessage.content) : null
  if (rawMessageText) return rawMessageText

  if (typeof record.result === 'string' && record.result.trim().length > 0) {
    return record.result
  }

  const rawCodexText = textFromCodexMessage(record)
  if (rawCodexText) return rawCodexText

  const wrapped = isRecord(record.event) ? record.event : null
  const wrappedMessage = wrapped && isRecord(wrapped.message) ? wrapped.message : null
  const wrappedMessageText = wrappedMessage ? textFromContentParts(wrappedMessage.content) : null
  if (wrappedMessageText) return wrappedMessageText

  if (wrapped && typeof wrapped.result === 'string' && wrapped.result.trim().length > 0) {
    return wrapped.result
  }

  if (wrapped) {
    return textFromCodexMessage(wrapped)
  }

  return null
}

export function extractScoredResponseText(transcriptJsonl: string): ExtractedText | null {
  let latest: ExtractedText | null = null

  for (const [lineIdx, line] of transcriptJsonl.split('\n').entries()) {
    const record = parseJsonLine(line)
    if (record === undefined) continue

    const text = extractTextFromRecord(record)
    if (!text) continue

    latest = {
      text,
      eventId: typeof record.event_id === 'string' ? record.event_id : undefined,
      turnIdx: typeof record.turn_idx === 'number' ? record.turn_idx : undefined,
      lineIdx,
    }
  }

  return latest
}

export function scoreTranscriptRecall(input: {
  transcriptPath: string
  qrels: readonly TranscriptQrel[]
}): TranscriptRecallScore {
  let transcript: string
  try {
    transcript = readFileSync(input.transcriptPath, 'utf8')
  } catch (error) {
    return {
      recall_at_5: 0,
      matched_qrels: 0,
      denominator: Math.min(5, input.qrels.length),
      recall_error: `unable to read transcript: ${error instanceof Error ? error.message : String(error)}`,
    }
  }

  const scored = extractScoredResponseText(transcript)
  const denominator = Math.min(5, input.qrels.length)
  if (!scored) {
    return {
      recall_at_5: 0,
      matched_qrels: 0,
      denominator,
      recall_error: 'missing scored response text in transcript',
    }
  }

  const response = normalizeForRecall(scored.text)
  const qrels = input.qrels.slice(0, denominator)
  const matched = qrels.filter((qrel) =>
    response.includes(normalizeForRecall(qrel.expected_substring_in_response)),
  )
  const recall = calculateRecallAt5({ matchedQrels: matched.length, qrelCount: input.qrels.length })

  return {
    recall_at_5: recall,
    matched_qrels: matched.length,
    denominator,
    recall_reason: `matched ${matched.length}/${denominator} qrels from ${input.transcriptPath}`,
    scored_response_text: scored.text,
    scored_transcript_path: input.transcriptPath,
    scored_event_id: scored.eventId,
    scored_turn_idx: scored.turnIdx,
    scored_line_idx: scored.lineIdx,
  }
}
