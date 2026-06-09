import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(import.meta.dirname, '..', '..')

function readWorkflow(name: string): string {
  return readFileSync(join(repositoryRoot, '.github', 'workflows', name), 'utf8')
}

describe('reusable Cloudflare deploy workflows', () => {
  it('ship preview + production workflow_call shells with pinned setup actions', () => {
    const preview = readWorkflow('cloudflare-preview.yml')
    const production = readWorkflow('cloudflare-production.yml')

    for (const workflow of [preview, production]) {
      expect(workflow).toContain('workflow_call:')
      expect(workflow).toMatch(/actions\/checkout@[0-9a-f]{40}/u)
      expect(workflow).toMatch(/actions\/setup-node@[0-9a-f]{40}/u)
      expect(workflow).toMatch(/oven-sh\/setup-bun@[0-9a-f]{40}/u)
      expect(workflow).toContain('corepack enable')
      expect(workflow).toContain('corepack prepare "pnpm@${{ steps.pnpm.outputs.version }}" --activate')
      expect(workflow).not.toContain('secrets: inherit')
      expect(workflow).toContain('.webpresso/secrets.config.json')
      expect(workflow).toContain('dopplerhq/secrets-fetch-action@451892f16195f9ac360e1a5bcbf0b5fd0e957534')
      expect(workflow).toContain('infisical export --projectId="${INFISICAL_PROJECT_ID}"')
    }
  })

  it('keeps the preview workflow lane-aware and destroy-capable without guessing caller event state', () => {
    const preview = readWorkflow('cloudflare-preview.yml')

    expect(preview).toContain('lane:')
    expect(preview).toContain('mode:')
    expect(preview).toContain('destroy_command:')
    expect(preview).toContain('skip_when_ci_secret_missing:')
    expect(preview).toContain('Invalid preview lane')
    expect(preview).toContain('Invalid preview mode')
    expect(preview).toContain('mode=destroy requires workflow_call input destroy_command')
    expect(preview).toContain('DEPLOY_LANE: ${{ inputs.lane }}')
    expect(preview).toContain('DEPLOY_MODE: ${{ inputs.mode }}')
    expect(preview).not.toContain('pull_request:')
    expect(preview).not.toContain('workflow_dispatch:')
  })

  it('keeps production release gating caller-owned while exporting RELEASE_VERSION for local deploy scripts', () => {
    const production = readWorkflow('cloudflare-production.yml')

    expect(production).toContain('release_version:')
    expect(production).toContain('RELEASE_VERSION: ${{ inputs.release_version }}')
    expect(production).toContain('DEPLOY_LANE: prd')
    expect(production).not.toContain('tags: ["v*"]')
    expect(production).not.toContain('workflow_dispatch:')
  })
})
