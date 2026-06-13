import { readFileSync } from 'node:fs'

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
  return typeof value === 'object' && value !== null
}

function parseJsonLine(line: string): JsonRecord | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  try {
    const parsed = JSON.parse(trimmed) as unknown
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function normalizeForRecall(value: string): string {
  return value.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ')
}

function textFromContentParts(value: unknown): string | null {
  if (!Array.isArray(value)) return null

  const parts = value
    .map((part) => (isRecord(part) && typeof part.text === 'string' ? part.text : null))
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)

  return parts.length > 0 ? parts.join('\n') : null
}

function extractTextFromRecord(record: JsonRecord): string | null {
  const rawMessage = isRecord(record.message) ? record.message : null
  const rawMessageText = rawMessage ? textFromContentParts(rawMessage.content) : null
  if (rawMessageText) return rawMessageText

  if (typeof record.result === 'string' && record.result.trim().length > 0) {
    return record.result
  }

  const wrapped = isRecord(record.event) ? record.event : null
  const wrappedMessage = wrapped && isRecord(wrapped.message) ? wrapped.message : null
  const wrappedMessageText = wrappedMessage ? textFromContentParts(wrappedMessage.content) : null
  if (wrappedMessageText) return wrappedMessageText

  if (wrapped && typeof wrapped.result === 'string' && wrapped.result.trim().length > 0) {
    return wrapped.result
  }

  return null
}

export function extractScoredResponseText(transcriptJsonl: string): ExtractedText | null {
  let latest: ExtractedText | null = null

  for (const [lineIdx, line] of transcriptJsonl.split('\n').entries()) {
    const record = parseJsonLine(line)
    if (!record) continue

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
  if (!scored || !scored.text.trim()) {
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
  const recall = denominator > 0 ? matched.length / denominator : 0

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
