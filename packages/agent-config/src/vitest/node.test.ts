import { describe, expect, it, vi } from 'vitest'

vi.mock('vite-plus/test/config', () => ({
  defineConfig: (config: unknown) => config,
}))

const { createNodeProjects } = await import('./node.js')

type ProjectShape = {
  resolve?: { alias?: Array<{ find: unknown; replacement: string }> }
  server?: { deps?: { inline?: unknown[] } }
  test?: { name?: string; setupFiles?: string[] }
}

const WEBPRESSO_INLINE = String(/webpresso/)

describe('createNodeProjects extension seams', () => {
  it('returns unit + integration projects with no extras by default', () => {
    const projects = createNodeProjects('demo') as ProjectShape[]

    expect(projects).toHaveLength(2)
    expect(projects[0]?.test?.name).toBe('demo/unit')
    expect(projects[1]?.test?.name).toBe('demo/integration')
    // Unit project does not gain setupFiles unless extras are supplied.
    expect(projects[0]?.test?.setupFiles).toBeUndefined()
    // Built-in webpresso inline is present on both projects.
    for (const project of projects) {
      const inline = (project.server?.deps?.inline ?? []).map(String)
      expect(inline).toContain(WEBPRESSO_INLINE)
    }
  })

  it('appends extraAlias to both unit and integration projects', () => {
    const extra = { find: /^bun:sqlite$/, replacement: '/mock/bun-sqlite.js' }
    const projects = createNodeProjects('demo', { extraAlias: [extra] }) as ProjectShape[]

    for (const project of projects) {
      expect(project.resolve?.alias ?? []).toContainEqual(extra)
    }
  })

  it('merges extraInline into deps.inline of both projects, preserving the built-in', () => {
    const marker = /@repo\/types/
    const projects = createNodeProjects('demo', { extraInline: [marker] }) as ProjectShape[]

    for (const project of projects) {
      const inline = (project.server?.deps?.inline ?? []).map(String)
      expect(inline).toContain(String(marker))
      expect(inline).toContain(WEBPRESSO_INLINE)
    }
  })

  it('appends extraSetupFiles to both projects, keeping node-setup on integration', () => {
    const setup = '/repo/extra-setup.js'
    const [unit, integration] = createNodeProjects('demo', {
      extraSetupFiles: [setup],
    }) as ProjectShape[]

    expect(unit?.test?.setupFiles).toStrictEqual([setup])
    expect(integration?.test?.setupFiles?.at(-1)).toBe(setup)
    expect(integration?.test?.setupFiles?.some((file) => file.endsWith('node-setup.js'))).toBe(true)
  })
})
