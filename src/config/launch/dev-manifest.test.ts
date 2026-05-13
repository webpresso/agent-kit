import { describe, expect, it } from 'vitest'

import {
  parseDevManifest,
  resolveDevTargets,
  type DevManifestInput,
  type NormalizedDevManifest,
} from './dev-manifest'

function manifest(overrides: Partial<DevManifestInput> = {}): DevManifestInput {
  return {
    version: 1,
    services: {
      api: {
        command: 'node',
        args: ['api.js'],
        cwd: 'services/api',
        env: { PORT: '4010' },
        readiness: { type: 'http', path: '/health' },
      },
      web: {
        command: 'node',
        args: ['web.js'],
        dependsOn: ['api'],
        readiness: { type: 'log', pattern: 'listening' },
      },
    },
    groups: {
      full: {
        services: ['api', 'web'],
      },
    },
    defaults: {
      target: 'full',
    },
    ...overrides,
  }
}

describe('parseDevManifest', () => {
  it('normalizes a portable manifest without Webpresso-specific target names', () => {
    const parsed = parseDevManifest(manifest())

    expect(parsed.version).toBe(1)
    expect(parsed.services.api?.command).toBe('node')
    expect(parsed.services.api?.args).toEqual(['api.js'])
    expect(parsed.services.api?.env).toEqual({ PORT: '4010' })
    expect(parsed.services.api?.dependsOn).toEqual([])
    expect(parsed.services.web?.dependsOn).toEqual(['api'])
    expect(parsed.groups.full?.services).toEqual(['api', 'web'])
  })

  it('rejects group references to unknown services with an actionable error', () => {
    expect(() =>
      parseDevManifest({
        version: 1,
        services: {
          api: { command: 'node', args: ['api.js'] },
        },
        groups: {
          full: { services: ['api', 'missing'] },
        },
      }),
    ).toThrow('groups.full.services references unknown service "missing"')
  })

  it('rejects service dependencies that are not defined in the manifest', () => {
    expect(() =>
      parseDevManifest({
        version: 1,
        services: {
          web: { command: 'node', args: ['web.js'], dependsOn: ['api'] },
        },
      }),
    ).toThrow('services.web.dependsOn references unknown service "api"')
  })
})

describe('resolveDevTargets', () => {
  it('uses the manifest default target when no explicit target is supplied', () => {
    const parsed = parseDevManifest(manifest())

    expect(resolveDevTargets(parsed)).toEqual(['api', 'web'])
  })

  it('expands group aliases and orders dependencies before dependents', () => {
    const parsed = parseDevManifest({
      version: 1,
      services: {
        database: { command: 'node', args: ['db.js'] },
        api: { command: 'node', args: ['api.js'], dependsOn: ['database'] },
        web: { command: 'node', args: ['web.js'], dependsOn: ['api'] },
      },
      groups: {
        full: { services: ['web'] },
      },
    })

    expect(resolveDevTargets(parsed, 'full')).toEqual(['database', 'api', 'web'])
  })

  it('resolves a single service target with its dependencies', () => {
    const parsed = parseDevManifest(manifest())

    expect(resolveDevTargets(parsed, 'web')).toEqual(['api', 'web'])
  })

  it('rejects unknown targets and lists known services and groups', () => {
    const parsed = parseDevManifest(manifest())

    expect(() => resolveDevTargets(parsed, 'worker')).toThrow(
      'Unknown dev target "worker". Known services: api, web. Known groups: full.',
    )
  })

  it('detects cyclic dependencies instead of recursing forever', () => {
    const parsed: NormalizedDevManifest = parseDevManifest({
      version: 1,
      services: {
        api: { command: 'node', args: ['api.js'], dependsOn: ['web'] },
        web: { command: 'node', args: ['web.js'], dependsOn: ['api'] },
      },
    })

    expect(() => resolveDevTargets(parsed, 'web')).toThrow(
      'Cyclic dev service dependency detected: web -> api -> web',
    )
  })
})
