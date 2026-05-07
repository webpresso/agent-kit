import { describe, expect, it } from 'vitest'

import type { ToolInput } from '#hooks/shared/types'

import { validateDangerousCommands, VALIDATOR_NAME } from './dangerous-commands.js'

const bash = (command: string): ToolInput => ({
  tool_input: { command },
})

describe('validateDangerousCommands', () => {
  it('VALIDATOR_NAME is dangerous-commands', () => {
    expect(VALIDATOR_NAME).toBe('dangerous-commands')
  })

  it('skips non-Bash inputs', () => {
    const result = validateDangerousCommands({
      tool_input: { file_path: '/tmp/x', old_string: 'a', new_string: 'b' },
    })
    expect(result.passed).toBe(true)
  })

  it('passes safe Bash commands', () => {
    expect(validateDangerousCommands(bash('git status')).passed).toBe(true)
    expect(validateDangerousCommands(bash('ls -la')).passed).toBe(true)
    expect(validateDangerousCommands(bash('echo hello > out.txt')).passed).toBe(true)
  })

  describe('existing dangerous patterns', () => {
    it.each([
      ['git push --force', 'force-push'],
      ['git push -f origin main', 'force-push short'],
      ['rm -rf /', 'rm -rf root'],
      ['rm -rf ~', 'rm -rf home'],
      ['git reset --hard HEAD', 'reset hard'],
      ['mkfs.ext4 /dev/sdx', 'mkfs'],
      ['dd if=/dev/zero of=/dev/sda', 'dd to device'],
    ])('blocks: %s (%s)', (cmd) => {
      const result = validateDangerousCommands(bash(cmd))
      expect(result.passed).toBe(false)
      expect(result.message).toContain(cmd)
    })
  })

  describe('secret-to-disk patterns', () => {
    it('blocks redirecting `gh auth token` to a file', () => {
      const result = validateDangerousCommands(bash('gh auth token > ~/.cache/token'))
      expect(result.passed).toBe(false)
      expect(result.message).toMatch(/never cache secrets/i)
    })

    it('blocks redirecting `op read` to a file', () => {
      const result = validateDangerousCommands(
        bash('op read op://vault/item/credential > /tmp/creds'),
      )
      expect(result.passed).toBe(false)
    })

    it('blocks redirecting `doppler secrets get` to a file', () => {
      const result = validateDangerousCommands(
        bash('doppler secrets get DATABASE_URL --plain > .env'),
      )
      expect(result.passed).toBe(false)
    })

    it('blocks redirecting `aws sts get-session-token` to a file', () => {
      const result = validateDangerousCommands(
        bash('aws sts get-session-token > /tmp/aws-creds.json'),
      )
      expect(result.passed).toBe(false)
    })

    it('blocks redirecting `gcloud auth print-access-token` to a file', () => {
      const result = validateDangerousCommands(
        bash('gcloud auth print-access-token >> ~/.config/gcloud-token'),
      )
      expect(result.passed).toBe(false)
    })

    it('blocks piping `gh auth token` through tee', () => {
      const result = validateDangerousCommands(bash('gh auth token | tee ~/.cache/token'))
      expect(result.passed).toBe(false)
      expect(result.message).toMatch(/tee\/sponge\/dd/i)
    })

    it('blocks piping a secret-source command through dd', () => {
      const result = validateDangerousCommands(bash('op read op://vault/item | dd of=/tmp/secret'))
      expect(result.passed).toBe(false)
    })

    it('blocks redirecting $GH_PACKAGES_TOKEN env var to a file', () => {
      const result = validateDangerousCommands(
        bash('echo "$GH_PACKAGES_TOKEN" > ~/.cache/gh-token'),
      )
      expect(result.passed).toBe(false)
      expect(result.message).toMatch(/echo\/printf/i)
    })

    it('blocks redirecting ${GITHUB_TOKEN} env var to a file', () => {
      const result = validateDangerousCommands(
        bash('printf "%s" "${GITHUB_TOKEN}" > /tmp/gh-token'),
      )
      expect(result.passed).toBe(false)
    })

    it('blocks redirecting $OPENAI_API_KEY to a file', () => {
      const result = validateDangerousCommands(bash('echo $OPENAI_API_KEY > .env.local'))
      expect(result.passed).toBe(false)
    })

    it('blocks `>>` (append) redirects of secret env vars', () => {
      const result = validateDangerousCommands(bash('echo "$ANTHROPIC_API_KEY" >> ~/.cache/keys'))
      expect(result.passed).toBe(false)
    })

    it('passes `gh auth token` without redirect (fine in a subshell)', () => {
      expect(validateDangerousCommands(bash('GH_PACKAGES_TOKEN="$(gh auth token)"')).passed).toBe(
        true,
      )
      expect(validateDangerousCommands(bash('TOKEN=$(gh auth token); curl -H ...')).passed).toBe(
        true,
      )
    })

    it('passes echo of a non-secret env var to a file', () => {
      expect(validateDangerousCommands(bash('echo "$PATH" > /tmp/path-debug')).passed).toBe(true)
      expect(validateDangerousCommands(bash('echo "hello $USER" > out.txt')).passed).toBe(true)
    })

    it('passes secret-source commands that read into a file (input redirect, not output)', () => {
      // < is input redirect, not output — should not match the > pattern
      expect(validateDangerousCommands(bash('gh auth status < /dev/null > /dev/null')).passed).toBe(
        true,
      )
    })
  })

  describe('skip via env var', () => {
    it('respects DANGEROUS_COMMANDS_SKIP=1', () => {
      const prev = process.env.DANGEROUS_COMMANDS_SKIP
      process.env.DANGEROUS_COMMANDS_SKIP = '1'
      try {
        const result = validateDangerousCommands(bash('rm -rf /'))
        expect(result.passed).toBe(true)
      } finally {
        if (prev === undefined) delete process.env.DANGEROUS_COMMANDS_SKIP
        else process.env.DANGEROUS_COMMANDS_SKIP = prev
      }
    })
  })
})
