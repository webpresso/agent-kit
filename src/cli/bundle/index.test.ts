import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { globSync } from 'glob'
import { describe, expect, it } from 'vitest'

import agentBundle, {
  AGENT_BUNDLE,
  agentBundle as namedAgentBundle,
  agentBundles,
  blueprintBundle,
} from '#cli/bundle/index.js'

const repoRoot = join(import.meta.dirname, '..', '..', '..')

function findDuplicateBundleRoots(
  bundles: readonly { name: string; config: { namespaceRoots: readonly string[] } }[],
): string[] {
  const ownersByRoot = new Map<string, Set<string>>()
  for (const bundle of bundles) {
    for (const root of bundle.config.namespaceRoots) {
      const owners = ownersByRoot.get(root) ?? new Set<string>()
      owners.add(bundle.name)
      ownersByRoot.set(root, owners)
    }
  }
  return [...ownersByRoot.entries()]
    .filter(([, owners]) => owners.size > 1)
    .map(([root]) => root)
    .toSorted()
}

async function listCommandPaths(
  commands: Record<string, unknown>,
  prefix: readonly string[] = [],
): Promise<string[]> {
  const paths: string[] = []

  for (const [name, command] of Object.entries(commands)) {
    const path = [...prefix, name]
    paths.push(path.join(' '))

    const subCommands = (command as { subCommands?: Record<string, () => unknown> }).subCommands
    if (!subCommands) continue

    const resolvedSubCommands: Record<string, unknown> = {}
    for (const [subCommandName, resolver] of Object.entries(subCommands)) {
      resolvedSubCommands[subCommandName] = await resolver()
    }
    paths.push(...(await listCommandPaths(resolvedSubCommands, path)))
  }

  return paths
}

describe('agent-kit CLI bundles', () => {
  it('keeps bundle source and manifests aligned to the published shared contract package', () => {
    const contractConsumerSources = globSync('src/cli/bundle/{index.ts,commands/**/*.ts}', {
      cwd: repoRoot,
      ignore: ['src/cli/bundle/**/*.test.ts'],
    })

    expect(contractConsumerSources.length).toBeGreaterThan(0)
    for (const sourcePath of contractConsumerSources) {
      expect(readFileSync(join(repoRoot, sourcePath), 'utf8')).toContain('@webpresso/cli-contract')
    }

    expect(readFileSync(join(repoRoot, 'package.json'), 'utf8')).toContain(
      '@webpresso/cli-contract',
    )
    expect(globSync('src/cli/bundle/contract.ts', { cwd: repoRoot })).toEqual([])
  })

  it('keeps the compatibility inventory metadata pointed at the public host', () => {
    expect(AGENT_BUNDLE.bundleId).toBe('agent-kit')
    expect(AGENT_BUNDLE.commandRoot).toBe('agent')
    expect(AGENT_BUNDLE.sourcePackage).toBe('@webpresso/agent-kit')
    expect(AGENT_BUNDLE.intendedHostPackage).toBe('@webpresso/cli-host')
    expect(AGENT_BUNDLE.commands.length).toBeGreaterThan(0)

    for (const command of AGENT_BUNDLE.commands) {
      expect(command.namespace).toBe('agent')
      expect(command.id.startsWith('agent ')).toBe(true)
      expect(command.replacementCommand.startsWith('webpresso agent ')).toBe(true)
    }
  })

  it('exports runnable agent and blueprint CliBundles from the public bundle subpath', () => {
    expect(agentBundle).toBe(namedAgentBundle)
    expect(agentBundles).toEqual([blueprintBundle, agentBundle])
    expect(findDuplicateBundleRoots([blueprintBundle, agentBundle])).toEqual([])

    expect(agentBundle).toMatchObject({
      config: {
        apiVersion: 1,
        distributionProfiles: ['public', 'agent'],
        hostRange: '^0.2.0',
        namespaceRoots: ['agent'],
      },
      name: 'agent',
      version: '0.2.0',
    })
    expect(blueprintBundle).toMatchObject({
      config: {
        apiVersion: 1,
        distributionProfiles: ['public', 'agent'],
        hostRange: '^0.2.0',
        namespaceRoots: ['blueprint'],
      },
      name: 'blueprint',
      version: '0.2.0',
    })
  })

  it('keeps the agent command leaf inventory stable for host extraction', async () => {
    await expect(
      listCommandPaths(agentBundle.commands).then((paths) => paths.toSorted()),
    ).resolves.toEqual([
      'audit',
      'audit blueprint-lifecycle',
      'audit bucket-boundary',
      'audit bundle-budget',
      'audit catalog-drift',
      'audit commit-message',
      'audit docs-frontmatter',
      'audit mutation',
      'audit no-legacy-cli-bin',
      'audit no-relative-parent-imports',
      'audit quality',
      'audit tech-debt',
      'audit tph',
      'audit tph-e2e',
      'dev',
      'docs',
      'docs lint',
      'e2e',
      'hooks',
      'hooks doctor',
      'setup',
      'skills',
      'skills install',
      'skills list',
      'symlink',
      'symlink check',
      'symlink import',
      'symlink sync',
      'tech-debt',
      'tech-debt list',
      'tech-debt new',
      'tech-debt review',
      'test',
    ])
  })

  it('keeps the blueprint command leaf inventory stable for host extraction', async () => {
    await expect(
      listCommandPaths(blueprintBundle.commands).then((paths) => paths.toSorted()),
    ).resolves.toEqual([
      'audit',
      'exec',
      'exec logs',
      'exec resume',
      'exec status',
      'exec stop',
      'finalize',
      'list',
      'move',
      'new',
      'park',
      'show',
      'start',
      'task',
      'task block',
      'task complete',
      'task start',
      'task unblock',
    ])
  })
})
