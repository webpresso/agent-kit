import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(import.meta.dirname, '..', '..')
const packageJsonPath = join(repositoryRoot, 'package.json')
const workflowPaths = [
  join(repositoryRoot, '.github', 'workflows', 'ci.webpresso.yml'),
  join(repositoryRoot, '.github', 'workflows', 'bundle-smoke.yml'),
  join(repositoryRoot, '.github', 'workflows', 'release.yml'),
] as const

function readPackageJson(): { dependencies?: Record<string, string> } {
  return JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    dependencies?: Record<string, string>
  }
}

function readWorkflow(path: string): string {
  return readFileSync(path, 'utf8')
}

function extractProbedPackages(workflow: string): string[] {
  return [...workflow.matchAll(/npm (?:view|pack) (@webpresso\/[^@\s]+)@latest/g)].map(
    (match) => match[1]!,
  )
}

describe('auth preflight package probes', () => {
  it('probe a published direct dependency instead of a framework-internal leaf package', () => {
    const deps = readPackageJson().dependencies ?? {}
    expect(deps['@webpresso/webpresso']).toBeDefined()
    expect(deps['@webpresso/runtime-storage']).toBeUndefined()

    for (const workflowPath of workflowPaths) {
      const workflow = readWorkflow(workflowPath)
      expect(extractProbedPackages(workflow)).toEqual([
        '@webpresso/webpresso',
        '@webpresso/webpresso',
      ])
      expect(workflow.includes('@webpresso/runtime@latest')).toBe(false)
    }
  })
})
