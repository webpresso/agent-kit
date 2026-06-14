import { describe, expect, it } from 'vitest'

import { diffStructuralEnvelope, structuralEnvelope } from './schema-envelope'

describe('provider schema envelope canary', () => {
  it('ignores provider payload values that naturally change between runs', () => {
    const expected = {
      type: 'result',
      id: 'run-a',
      duration_ms: 10,
      result: 'first answer',
      usage: { input_tokens: 1, output_tokens: 2 },
    }
    const actual = {
      type: 'result',
      id: 'run-b',
      duration_ms: 99,
      result: 'different answer',
      usage: { input_tokens: 10, output_tokens: 20 },
    }

    expect(diffStructuralEnvelope(expected, actual)).toEqual([])
  })

  it('fails on structural key, type, and nesting drift', () => {
    const expected = { type: 'result', result: 'answer', usage: { input_tokens: 1 } }
    const actual = { type: 'result', result: ['answer'], metrics: { input_tokens: 1 } }

    expect(diffStructuralEnvelope(expected, actual)).toEqual([
      'added $.metrics.input_tokens:number',
      'added $.metrics:object',
      'added $.result:array',
      'added $.result[]:string',
      'missing $.result:string',
      'missing $.usage.input_tokens:number',
      'missing $.usage:object',
    ])
  })

  it('fingerprints array element object shape without preserving array values', () => {
    expect(structuralEnvelope({ message: { content: [{ type: 'text', text: 'a' }] } })).toEqual([
      '$.message.content:array',
      '$.message.content[].text:string',
      '$.message.content[].type:string',
      '$.message.content[]:object',
      '$.message:object',
      '$:object',
    ])
  })

  it('fingerprints scalar, null, primitive arrays, object arrays, empty arrays, and sorted keys', () => {
    expect(structuralEnvelope(null)).toEqual(['$:null'])
    expect(structuralEnvelope('text')).toEqual(['$:string'])
    expect(structuralEnvelope([7, 8])).toEqual(['$:array', '$[]:number'])
    expect(structuralEnvelope([undefined, 7])).toEqual(['$:array', '$[]:number'])
    expect(structuralEnvelope([7, { a: true }])).toEqual(['$:array', '$[].a:boolean', '$[]:object'])
    expect(structuralEnvelope([])).toEqual(['$:array'])
    expect(structuralEnvelope([{ b: 1, a: true }])).toEqual([
      '$:array',
      '$[].a:boolean',
      '$[].b:number',
      '$[]:object',
    ])
    expect(structuralEnvelope({ z: 1, a: 2 })).toEqual(['$.a:number', '$.z:number', '$:object'])
  })
})
