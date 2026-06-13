import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  extractScoredResponseText,
  scoreTranscriptRecall,
  type TranscriptQrel,
} from './transcript-scorer'

const QRELS: TranscriptQrel[] = [
  { question: 'file?', expected_substring_in_response: 'queue-runner.ts' },
  { question: 'loss?', expected_substring_in_response: 'before the final checkpoint write' },
  { question: 'checkpoint?', expected_substring_in_response: 'sync-state.ts' },
  { question: 'proof?', expected_substring_in_response: 'retry regression test' },
  { question: 'second proof?', expected_substring_in_response: 'queue replay' },
]

function fixture(name: string): string {
  return resolve(import.meta.dirname, '..', '__fixtures__', name)
}

describe('transcript-scorer', () => {
  let dir = ''

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = ''
  })

  it('scores raw Claude stream-json result text against the first five qrels', () => {
    const score = scoreTranscriptRecall({
      transcriptPath: fixture('claude-raw-recall.jsonl'),
      qrels: QRELS,
    })

    expect(score).toMatchObject({
      recall_at_5: 1,
      matched_qrels: 5,
      denominator: 5,
      scored_line_idx: 1,
    })
    expect(score.recall_reason).toContain('matched 5/5 qrels')
    expect(score.scored_transcript_path).toBe(fixture('claude-raw-recall.jsonl'))
    expect(score.recall_error).toBeUndefined()
  })

  it('scores recorder-wrapped Claude stream-json events and preserves provenance', () => {
    const score = scoreTranscriptRecall({
      transcriptPath: fixture('claude-wrapped-recall.jsonl'),
      qrels: QRELS,
    })

    expect(score).toMatchObject({
      recall_at_5: 1,
      matched_qrels: 5,
      denominator: 5,
      scored_event_id: 'evt-2',
      scored_turn_idx: 1,
    })
  })

  it('extracts raw assistant message content and wrapped assistant message content', () => {
    const raw = extractScoredResponseText(
      JSON.stringify({ message: { content: [{ type: 'text', text: 'raw assistant text' }] } }),
    )
    const wrapped = extractScoredResponseText(
      JSON.stringify({
        event_id: 'evt-message',
        event: { message: { content: [{ type: 'text', text: 'wrapped assistant text' }] } },
      }),
    )

    expect(raw?.text).toBe('raw assistant text')
    expect(wrapped?.text).toBe('wrapped assistant text')
    expect(wrapped?.eventId).toBe('evt-message')
  })

  it('normalizes unicode case and whitespace before matching expected substrings', () => {
    dir = mkdtempSync(join(tmpdir(), 'transcript-scorer-'))
    const transcriptPath = join(dir, 'transcript.jsonl')
    writeFileSync(
      transcriptPath,
      `${JSON.stringify({ result: 'QUEUE-RUNNER.TS\n before   the final checkpoint write sync-state.ts retry regression test queue replay' })}\n`,
      'utf8',
    )

    expect(scoreTranscriptRecall({ transcriptPath, qrels: QRELS }).recall_at_5).toBe(1)
  })

  it('returns an explicit recall_error for malformed or unsupported transcripts', () => {
    dir = mkdtempSync(join(tmpdir(), 'transcript-scorer-empty-'))
    const transcriptPath = join(dir, 'transcript.jsonl')
    writeFileSync(transcriptPath, 'not-json\n{"unsupported":true}\n', 'utf8')

    const score = scoreTranscriptRecall({ transcriptPath, qrels: QRELS })

    expect(score.recall_at_5).toBe(0)
    expect(score.recall_error).toMatch(/missing scored response text/)
  })

  it('returns an explicit recall_error when transcript cannot be read', () => {
    const score = scoreTranscriptRecall({
      transcriptPath: '/no/such/transcript.jsonl',
      qrels: QRELS,
    })

    expect(score.recall_at_5).toBe(0)
    expect(score.recall_error).toMatch(/unable to read transcript/)
  })
})
