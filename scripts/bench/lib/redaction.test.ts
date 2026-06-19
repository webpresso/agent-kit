import { describe, expect, it } from 'vitest'

import { redactionStatus, scanForRedaction } from './redaction'

describe('scanForRedaction', () => {
  it('detects an API key (sk- prefix)', () => {
    const text = 'token: sk-ant-abc123abc123abc123abc123abc123'
    const findings = scanForRedaction(text, 'test.txt')
    expect(findings.length).toStrictEqual(1)
    expect(findings[0]?.kind).toStrictEqual('api_key')
    expect(findings[0]?.artifactPath).toStrictEqual('test.txt')
    expect(findings[0]?.lineNumber).toStrictEqual(1)
  })

  it('detects ANTHROPIC_API_KEY assignment', () => {
    const text = 'ANTHROPIC_API_KEY=sk-ant-abc123'
    const findings = scanForRedaction(text, 'config.env')
    expect(findings.length).toStrictEqual(1)
    expect(findings[0]?.kind).toStrictEqual('api_key')
  })

  it('detects Bearer token', () => {
    const text = 'Authorization: Bearer ghp_abc123abc123abc123'
    const findings = scanForRedaction(text, 'req.txt')
    expect(findings.length).toStrictEqual(1)
    expect(findings[0]?.kind).toStrictEqual('api_key')
  })

  it('detects npm token', () => {
    const text = 'npm_AbCdEfGhIjKlMnOpQrStUvWxYz12345678'
    const findings = scanForRedaction(text, 'test.txt')
    expect(findings.length).toStrictEqual(1)
    expect(findings[0]?.kind).toStrictEqual('api_key')
  })

  it('returns empty findings for clean text', () => {
    const text = '# Session Memory Benchmark\nMetric: 12345 bytes'
    const findings = scanForRedaction(text, 'report.md')
    expect(findings).toStrictEqual([])
  })

  it('detects local absolute path /Users/', () => {
    const text = 'artifact: /Users/ozby/repos/agent-kit/bench/runs/abc/report.json'
    const findings = scanForRedaction(text, 'out.txt')
    expect(findings.length).toStrictEqual(1)
    expect(findings[0]?.kind).toStrictEqual('local_abs_path')
  })

  it('detects local absolute path /home/', () => {
    const text = 'cache: /home/runner/.npm/cache'
    const findings = scanForRedaction(text, 'log.txt')
    expect(findings.length).toStrictEqual(1)
    expect(findings[0]?.kind).toStrictEqual('local_abs_path')
  })

  it('does NOT flag placeholder documentation', () => {
    const text = 'Replace <absolute-local-path> with your repo root'
    const findings = scanForRedaction(text, 'docs.md')
    expect(findings).toStrictEqual([])
  })

  it('detects auth env var as assignment (GH_PACKAGES_TOKEN)', () => {
    const text = 'GH_PACKAGES_TOKEN=ghp_abc123'
    const findings = scanForRedaction(text, 'env.txt')
    expect(findings.length).toStrictEqual(1)
    expect(findings[0]?.kind).toStrictEqual('auth_env_name')
  })

  it('does NOT flag auth env var when only mentioned in doc string (no assignment)', () => {
    const text = 'Set GH_PACKAGES_TOKEN in your environment'
    const findings = scanForRedaction(text, 'docs.md')
    expect(findings).toStrictEqual([])
  })

  it('detects NPM_TOKEN assignment', () => {
    const text = 'NPM_TOKEN=abc123'
    const findings = scanForRedaction(text, '.env')
    expect(findings.length).toStrictEqual(1)
    expect(findings[0]?.kind).toStrictEqual('auth_env_name')
  })

  it('does NOT flag NPM_TOKEN in a doc mention without assignment', () => {
    const text = 'Do not use NPM_TOKEN publish fallbacks in Webpresso repos'
    const findings = scanForRedaction(text, 'docs.md')
    expect(findings).toStrictEqual([])
  })

  it('detects GITHUB_TOKEN assignment', () => {
    const text = 'GITHUB_TOKEN=ghs_abc123'
    const findings = scanForRedaction(text, 'ci.yml')
    expect(findings.length).toStrictEqual(1)
    expect(findings[0]?.kind).toStrictEqual('auth_env_name')
  })

  it('detects OPENAI_API_KEY assignment', () => {
    const text = 'OPENAI_API_KEY=sk-openai-abc123'
    const findings = scanForRedaction(text, 'config.ts')
    expect(findings.length).toStrictEqual(1)
    expect(findings[0]?.kind).toStrictEqual('auth_env_name')
  })

  it('detects private transcript marker', () => {
    const text = 'Some content\n[PRIVATE TRANSCRIPT]\nmore content'
    const findings = scanForRedaction(text, 'session.txt')
    expect(findings.length).toStrictEqual(1)
    expect(findings[0]?.kind).toStrictEqual('private_transcript')
  })

  it('detects [REDACTED] marker', () => {
    const text = 'token: [REDACTED]'
    const findings = scanForRedaction(text, 'log.txt')
    expect(findings.length).toStrictEqual(1)
    expect(findings[0]?.kind).toStrictEqual('private_transcript')
  })

  it('detects ---BEGIN PRIVATE--- marker as a full line', () => {
    const text = '---BEGIN PRIVATE---'
    const findings = scanForRedaction(text, 'session.txt')
    expect(findings.length).toStrictEqual(1)
    expect(findings[0]?.kind).toStrictEqual('private_transcript')
  })

  it('includes lineNumber in findings', () => {
    const text = 'line one\nline two\n/Users/ozby/secret/path'
    const findings = scanForRedaction(text, 'test.txt')
    expect(findings.length).toStrictEqual(1)
    expect(findings[0]?.lineNumber).toStrictEqual(3)
  })

  it('lineHint is at most 80 chars', () => {
    const longLine = '/Users/ozby/' + 'a'.repeat(200)
    const findings = scanForRedaction(longLine, 'test.txt')
    expect(findings.length).toStrictEqual(1)
    const hint = findings[0]?.lineHint ?? ''
    expect(hint.length).toBeLessThanOrEqual(80)
  })

  it('detects ~/.claude path', () => {
    const text = 'path: ~/.claude/settings.json'
    const findings = scanForRedaction(text, 'test.txt')
    expect(findings.length).toStrictEqual(1)
    expect(findings[0]?.kind).toStrictEqual('local_abs_path')
  })

  it('detects /tmp/ path', () => {
    const text = 'tmpfile: /tmp/a-temp-file.json'
    const findings = scanForRedaction(text, 'test.txt')
    expect(findings.length).toStrictEqual(1)
    expect(findings[0]?.kind).toStrictEqual('local_abs_path')
  })
})

describe('redactionStatus', () => {
  it('returns clean when no findings', () => {
    expect(redactionStatus([])).toStrictEqual('clean')
  })

  it('returns needs_redaction when findings exist', () => {
    const finding = {
      artifactPath: 'f.txt',
      kind: 'api_key' as const,
      lineHint: 'sk-abc',
      lineNumber: 1,
    }
    expect(redactionStatus([finding])).toStrictEqual('needs_redaction')
  })
})
