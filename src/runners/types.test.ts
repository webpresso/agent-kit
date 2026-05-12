import { describe, expect, it } from 'vitest'

import { runnerEventSchema } from './types.js'

describe('runnerEventSchema', () => {
  describe('started variant', () => {
    it('parses a valid started event', () => {
      const input = { type: 'started', ts: '2024-01-01T00:00:00.000Z', handle: 'exec-1' }
      expect(runnerEventSchema.parse(input)).toStrictEqual(input)
    })

    it('fails when handle is missing', () => {
      const result = runnerEventSchema.safeParse({ type: 'started', ts: '2024-01-01T00:00:00.000Z' })
      expect(result.success).toBe(false)
    })
  })

  describe('progress variant', () => {
    it('parses a valid progress event', () => {
      const input = { type: 'progress', ts: '2024-01-01T00:00:00.000Z', handle: 'exec-1', message: 'Working...' }
      expect(runnerEventSchema.parse(input)).toStrictEqual(input)
    })

    it('fails when message is missing', () => {
      const result = runnerEventSchema.safeParse({ type: 'progress', ts: '2024-01-01T00:00:00.000Z', handle: 'exec-1' })
      expect(result.success).toBe(false)
    })
  })

  describe('stdout variant', () => {
    it('parses a valid stdout event', () => {
      const input = { type: 'stdout', ts: '2024-01-01T00:00:00.000Z', handle: 'exec-1', line: 'hello world' }
      expect(runnerEventSchema.parse(input)).toStrictEqual(input)
    })

    it('fails when line is missing', () => {
      const result = runnerEventSchema.safeParse({ type: 'stdout', ts: '2024-01-01T00:00:00.000Z', handle: 'exec-1' })
      expect(result.success).toBe(false)
    })
  })

  describe('stderr variant', () => {
    it('parses a valid stderr event', () => {
      const input = { type: 'stderr', ts: '2024-01-01T00:00:00.000Z', handle: 'exec-1', line: 'error line' }
      expect(runnerEventSchema.parse(input)).toStrictEqual(input)
    })

    it('fails when line is missing', () => {
      const result = runnerEventSchema.safeParse({ type: 'stderr', ts: '2024-01-01T00:00:00.000Z', handle: 'exec-1' })
      expect(result.success).toBe(false)
    })
  })

  describe('artifact variant', () => {
    it('parses a valid artifact event with optional mime', () => {
      const input = { type: 'artifact', ts: '2024-01-01T00:00:00.000Z', handle: 'exec-1', path: '/out/result.json', mime: 'application/json' }
      expect(runnerEventSchema.parse(input)).toStrictEqual(input)
    })

    it('parses a valid artifact event without mime', () => {
      const input = { type: 'artifact', ts: '2024-01-01T00:00:00.000Z', handle: 'exec-1', path: '/out/result.json' }
      expect(runnerEventSchema.parse(input)).toStrictEqual(input)
    })

    it('fails when path is missing', () => {
      const result = runnerEventSchema.safeParse({ type: 'artifact', ts: '2024-01-01T00:00:00.000Z', handle: 'exec-1' })
      expect(result.success).toBe(false)
    })
  })

  describe('completed variant', () => {
    it('parses a valid completed event', () => {
      const input = { type: 'completed', ts: '2024-01-01T00:00:00.000Z', handle: 'exec-1', exitCode: 0 }
      expect(runnerEventSchema.parse(input)).toStrictEqual(input)
    })

    it('parses a completed event with non-zero exit code', () => {
      const input = { type: 'completed', ts: '2024-01-01T00:00:00.000Z', handle: 'exec-1', exitCode: 1 }
      expect(runnerEventSchema.parse(input)).toStrictEqual(input)
    })

    it('fails when exitCode is missing', () => {
      const result = runnerEventSchema.safeParse({ type: 'completed', ts: '2024-01-01T00:00:00.000Z', handle: 'exec-1' })
      expect(result.success).toBe(false)
    })
  })

  describe('failed variant', () => {
    it('parses a valid failed event', () => {
      const input = { type: 'failed', ts: '2024-01-01T00:00:00.000Z', handle: 'exec-1', error: 'Something went wrong' }
      expect(runnerEventSchema.parse(input)).toStrictEqual(input)
    })

    it('fails when error field is missing', () => {
      const result = runnerEventSchema.safeParse({ type: 'failed', ts: '2024-01-01T00:00:00.000Z', handle: 'exec-1' })
      expect(result.success).toBe(false)
    })
  })

  describe('cancelled variant', () => {
    it('parses a valid cancelled event', () => {
      const input = { type: 'cancelled', ts: '2024-01-01T00:00:00.000Z', handle: 'exec-1' }
      expect(runnerEventSchema.parse(input)).toStrictEqual(input)
    })
  })

  describe('discriminant validation', () => {
    it('fails for an unknown type value', () => {
      const result = runnerEventSchema.safeParse({ type: 'unknown', ts: '2024-01-01T00:00:00.000Z', handle: 'exec-1' })
      expect(result.success).toBe(false)
    })

    it('fails when type field is missing entirely', () => {
      const result = runnerEventSchema.safeParse({ ts: '2024-01-01T00:00:00.000Z', handle: 'exec-1' })
      expect(result.success).toBe(false)
    })

    it('fails when ts is missing', () => {
      const result = runnerEventSchema.safeParse({ type: 'started', handle: 'exec-1' })
      expect(result.success).toBe(false)
    })
  })
})
