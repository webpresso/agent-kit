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

  it('scores raw and recorder-wrapped Codex JSONL through the same core path', () => {
    const rawScore = scoreTranscriptRecall({
      transcriptPath: fixture('codex-raw-recall.jsonl'),
      qrels: QRELS,
    })
    const wrappedScore = scoreTranscriptRecall({
      transcriptPath: fixture('codex-wrapped-recall.jsonl'),
      qrels: QRELS,
    })

    expect(rawScore).toMatchObject({ recall_at_5: 1, matched_qrels: 5, denominator: 5 })
    expect(wrappedScore).toMatchObject({
      recall_at_5: 1,
      matched_qrels: 5,
      denominator: 5,
      scored_event_id: 'codex-evt-2',
      scored_turn_idx: 1,
    })
  })

  it('scores only the first five qrels when a scenario has more than five labels', () => {
    dir = mkdtempSync(join(tmpdir(), 'transcript-scorer-six-qrels-'))
    const transcriptPath = join(dir, 'transcript.jsonl')
    writeFileSync(
      transcriptPath,
      `${JSON.stringify({ result: 'queue-runner.ts before the final checkpoint write sync-state.ts retry regression test queue replay' })}
`,
      'utf8',
    )

    const score = scoreTranscriptRecall({
      transcriptPath,
      qrels: [...QRELS, { question: 'ignored', expected_substring_in_response: 'absent sixth' }],
    })

    expect(score).toMatchObject({ recall_at_5: 1, matched_qrels: 5, denominator: 5 })
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

  it('returns null instead of throwing for malformed content containers and blank-only payloads', () => {
    expect(() =>
      extractScoredResponseText(JSON.stringify({ message: { content: { text: 'not-array' } } })),
    ).not.toThrow()
    expect(
      extractScoredResponseText(JSON.stringify({ message: { content: { text: 'not-array' } } })),
    ).toBeNull()
    expect(extractScoredResponseText(JSON.stringify({ message: '   ' }))).toBeNull()
    expect(extractScoredResponseText(JSON.stringify({ msg: { message: '   ' } }))).toBeNull()
    expect(extractScoredResponseText(JSON.stringify({ result: '   ' }))).toBeNull()
    expect(extractScoredResponseText(JSON.stringify({ event: { result: '   ' } }))).toBeNull()
    expect(
      extractScoredResponseText(
        JSON.stringify({ message: { content: [{ type: 'text', text: '   ' }] } }),
      ),
    ).toBeNull()
    expect(() => extractScoredResponseText('null\n42\ntrue')).not.toThrow()
    expect(extractScoredResponseText('null\n42\ntrue')).toBeNull()
    expect(() => extractScoredResponseText(JSON.stringify({ msg: { message: 123 } }))).not.toThrow()
    expect(extractScoredResponseText(JSON.stringify({ msg: { message: 123 } }))).toBeNull()
  })

  it('filters non-string and blank content parts before joining meaningful text parts', () => {
    const scored = extractScoredResponseText(
      JSON.stringify({
        message: {
          content: [
            { type: 'text', text: 'first line' },
            null,
            { type: 'text', text: '' },
            { type: 'tool_use', input: { text: 'not answer text' } },
            { type: 'text', text: 'second line' },
          ],
        },
      }),
    )

    expect(scored?.text).toBe('first line\nsecond line')
  })

  it('normalization trims qrels but does not let whitespace removal or Unicode uppercasing create false matches', () => {
    dir = mkdtempSync(join(tmpdir(), 'transcript-scorer-normalization-boundary-'))
    const transcriptPath = join(dir, 'transcript.jsonl')
    writeFileSync(transcriptPath, `${JSON.stringify({ result: 'ab STRASSE' })}\n`, 'utf8')

    const falsePositiveScore = scoreTranscriptRecall({
      transcriptPath,
      qrels: [
        { question: 'space-sensitive', expected_substring_in_response: 'a b' },
        { question: 'case-sensitive unicode expansion', expected_substring_in_response: 'straße' },
        ...QRELS.slice(2),
      ],
    })

    expect(falsePositiveScore.matched_qrels).toBe(0)
    expect(falsePositiveScore.recall_at_5).toBe(0)

    const trimBoundaryPath = join(dir, 'trim-boundary.jsonl')
    writeFileSync(trimBoundaryPath, `${JSON.stringify({ result: 'trimmed-token' })}\n`, 'utf8')
    expect(
      scoreTranscriptRecall({
        transcriptPath: trimBoundaryPath,
        qrels: [
          { question: 'trim', expected_substring_in_response: ' trimmed-token ' },
          ...QRELS.slice(1),
        ],
      }).matched_qrels,
    ).toBe(1)
  })

  it('never counts matching qrels after the first five labels', () => {
    dir = mkdtempSync(join(tmpdir(), 'transcript-scorer-sixth-match-'))
    const transcriptPath = join(dir, 'transcript.jsonl')
    writeFileSync(transcriptPath, `${JSON.stringify({ result: 'sixth-only' })}\n`, 'utf8')

    const score = scoreTranscriptRecall({
      transcriptPath,
      qrels: [
        { question: 'q1', expected_substring_in_response: 'missing-one' },
        { question: 'q2', expected_substring_in_response: 'missing-two' },
        { question: 'q3', expected_substring_in_response: 'missing-three' },
        { question: 'q4', expected_substring_in_response: 'missing-four' },
        { question: 'q5', expected_substring_in_response: 'missing-five' },
        { question: 'q6', expected_substring_in_response: 'sixth-only' },
      ],
    })

    expect(score).toMatchObject({ recall_at_5: 0, matched_qrels: 0, denominator: 5 })
  })

  it('ignores non-object JSON, array JSON, blank text parts, and non-string provenance fields', () => {
    const scored = extractScoredResponseText(
      [
        JSON.stringify(['array is not a record']),
        JSON.stringify({ event_id: 123, turn_idx: 'not-number', message: { content: [] } }),
        JSON.stringify({ message: { content: [{ type: 'text', text: '   ' }] } }),
        JSON.stringify({ event_id: 456, turn_idx: 'bad', result: 'queue-runner.ts' }),
      ].join('\n'),
    )

    expect(scored).toStrictEqual({
      text: 'queue-runner.ts',
      eventId: undefined,
      turnIdx: undefined,
      lineIdx: 3,
    })
  })

  it('uses the latest supported response text instead of the first one', () => {
    const scored = extractScoredResponseText(
      [
        JSON.stringify({ result: 'older answer' }),
        JSON.stringify({ result: 'newer answer' }),
        JSON.stringify({ unsupported: true }),
      ].join('\n'),
    )

    expect(scored?.text).toBe('newer answer')
    expect(scored?.lineIdx).toBe(1)
  })

  it('supports raw and wrapped result text paths separately from assistant content arrays', () => {
    const raw = extractScoredResponseText(JSON.stringify({ result: 'raw result text' }))
    const wrapped = extractScoredResponseText(
      JSON.stringify({ event_id: 'wrapped-result', event: { result: 'wrapped result text' } }),
    )

    expect(raw).toMatchObject({ text: 'raw result text', lineIdx: 0 })
    expect(wrapped).toMatchObject({
      text: 'wrapped result text',
      eventId: 'wrapped-result',
      lineIdx: 0,
    })
  })

  it('ignores blank raw, wrapped, and nested Codex messages before returning a real message', () => {
    const scored = extractScoredResponseText(
      [
        JSON.stringify({ message: '   ' }),
        JSON.stringify({ msg: { message: '' } }),
        JSON.stringify({ event: { result: '  ' } }),
        JSON.stringify({ event: { msg: { message: 'nested codex message' } } }),
      ].join('\n'),
    )

    expect(scored).toMatchObject({ text: 'nested codex message', lineIdx: 3 })
  })

  it('reports partial recall counts when only some first-five qrels match', () => {
    dir = mkdtempSync(join(tmpdir(), 'transcript-scorer-partial-'))
    const transcriptPath = join(dir, 'transcript.jsonl')
    writeFileSync(
      transcriptPath,
      `${JSON.stringify({ result: 'queue-runner.ts sync-state.ts' })}\n`,
      'utf8',
    )

    expect(scoreTranscriptRecall({ transcriptPath, qrels: QRELS })).toMatchObject({
      recall_at_5: 0.4,
      matched_qrels: 2,
      denominator: 5,
    })
  })

  it('keeps unreadable transcript denominators capped at five even when qrels exceed five', () => {
    const score = scoreTranscriptRecall({
      transcriptPath: '/no/such/transcript.jsonl',
      qrels: [...QRELS, { question: 'ignored', expected_substring_in_response: 'sixth' }],
    })

    expect(score).toMatchObject({ recall_at_5: 0, matched_qrels: 0, denominator: 5 })
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
