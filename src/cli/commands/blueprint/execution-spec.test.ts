import type { BlueprintExecutionBackend } from '#index'
import type { Blueprint } from '#local'

import { describe, expect, it } from 'vitest'

import {
  buildBlueprintExecutionControlCommand,
  buildBlueprintExecutionLaunchCommand,
  buildBlueprintExecutionRuntimePaths,
  buildBlueprintLaunchSpec,
  buildListTasksVerificationCommand,
  isMissingFileError,
  parseOmxTeamApiResponse,
  parseTeamExecutionId,
  resolveBridgeRelativePath,
  resolveControlStatus,
  resolveRuntimeSnapshotRelativePath,
  resolveTeamStateRelativePath,
  toProjectRelativePath,
  uniqueStrings,
} from './execution-spec.js'

// ---------------------------------------------------------------------------
// Minimal Blueprint fixture
// ---------------------------------------------------------------------------

function makeBlueprint(overrides: Partial<Blueprint> = {}): Blueprint {
  return {
    slug: 'test/my-plan',
    title: 'My Plan',
    status: 'in-progress',
    tasks: [],
    ...overrides,
  } as Blueprint
}

function makeTask(
  id: string,
  title: string,
  stepType: Blueprint['tasks'][number]['stepType'] = 'implement',
  depends?: string[],
  targetFile?: string,
): Blueprint['tasks'][number] {
  return { id, title, stepType, depends, targetFile } as Blueprint['tasks'][number]
}

// ---------------------------------------------------------------------------
// buildBlueprintLaunchSpec
// ---------------------------------------------------------------------------

describe('buildBlueprintLaunchSpec', () => {
  it('returns omx-team backend with durable mode', () => {
    const spec = buildBlueprintLaunchSpec({
      blueprint: makeBlueprint({ tasks: [makeTask('1.1', 'Do thing')] }),
      blueprintPath: 'blueprints/in-progress/my-plan/_overview.md',
      blueprintSlug: 'in-progress/my-plan',
    })
    expect(spec.backend).toBe('omx-team')
    expect(spec.mode).toBe('durable')
  })

  it('sets maxParallelism=1 when all tasks depend on each other', () => {
    const spec = buildBlueprintLaunchSpec({
      blueprint: makeBlueprint({
        tasks: [
          makeTask('1.1', 'A'),
          makeTask('1.2', 'B', 'implement', ['1.1']),
          makeTask('1.3', 'C', 'implement', ['1.2']),
        ],
      }),
      blueprintPath: 'blueprints/in-progress/plan/_overview.md',
      blueprintSlug: 'in-progress/plan',
    })
    // only 1.1 has no deps → countReadyTasks=1
    expect(spec.policy.maxParallelism).toBe(1)
  })

  it('caps maxParallelism at 3 even with 10 ready tasks', () => {
    const tasks = Array.from({ length: 10 }, (_, i) => makeTask(`1.${i + 1}`, `Task ${i + 1}`))
    const spec = buildBlueprintLaunchSpec({
      blueprint: makeBlueprint({ tasks }),
      blueprintPath: 'blueprints/in-progress/plan/_overview.md',
      blueprintSlug: 'in-progress/plan',
    })
    expect(spec.policy.maxParallelism).toBe(3)
  })

  it('maps implement/research tasks to longRunning=true', () => {
    const spec = buildBlueprintLaunchSpec({
      blueprint: makeBlueprint({
        tasks: [
          makeTask('1.1', 'Impl', 'implement'),
          makeTask('1.2', 'Research', 'research'),
          makeTask('1.3', 'Verify', 'verify'),
        ],
      }),
      blueprintPath: 'blueprints/in-progress/plan/_overview.md',
      blueprintSlug: 'in-progress/plan',
    })
    expect(spec.tasks[0]?.backendHints.longRunning).toBe(true)
    expect(spec.tasks[1]?.backendHints.longRunning).toBe(true)
    expect(spec.tasks[2]?.backendHints.longRunning).toBe(false)
  })

  it('maps test-fix/verify tasks to testHeavy=true', () => {
    const spec = buildBlueprintLaunchSpec({
      blueprint: makeBlueprint({
        tasks: [
          makeTask('1.1', 'Fix', 'test-fix'),
          makeTask('1.2', 'Verify', 'verify'),
          makeTask('1.3', 'Impl', 'implement'),
        ],
      }),
      blueprintPath: 'blueprints/in-progress/plan/_overview.md',
      blueprintSlug: 'in-progress/plan',
    })
    expect(spec.tasks[0]?.backendHints.testHeavy).toBe(true)
    expect(spec.tasks[1]?.backendHints.testHeavy).toBe(true)
    expect(spec.tasks[2]?.backendHints.testHeavy).toBe(false)
  })

  it('includes targetFile in task files array when set', () => {
    const spec = buildBlueprintLaunchSpec({
      blueprint: makeBlueprint({
        tasks: [makeTask('1.1', 'With file', 'implement', undefined, 'src/foo.ts')],
      }),
      blueprintPath: 'blueprints/in-progress/plan/_overview.md',
      blueprintSlug: 'in-progress/plan',
    })
    expect(spec.tasks[0]?.files).toEqual(['src/foo.ts'])
  })

  it('produces empty files array when no targetFile', () => {
    const spec = buildBlueprintLaunchSpec({
      blueprint: makeBlueprint({ tasks: [makeTask('1.1', 'No file')] }),
      blueprintPath: 'blueprints/in-progress/plan/_overview.md',
      blueprintSlug: 'in-progress/plan',
    })
    expect(spec.tasks[0]?.files).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// buildBlueprintExecutionLaunchCommand
// ---------------------------------------------------------------------------

describe('buildBlueprintExecutionLaunchCommand', () => {
  it('returns omx command with team subcommand', () => {
    const spec = buildBlueprintLaunchSpec({
      blueprint: makeBlueprint({ tasks: [makeTask('1.1', 'Do it')] }),
      blueprintPath: 'blueprints/in-progress/plan/_overview.md',
      blueprintSlug: 'in-progress/plan',
    })
    const launch = buildBlueprintExecutionLaunchCommand(spec)
    expect(launch.command).toBe('omx')
    expect(launch.args[0]).toBe('team')
    expect(launch.workerCount).toBeGreaterThanOrEqual(1)
  })

  it('encodes workerCount in executor arg', () => {
    const spec = buildBlueprintLaunchSpec({
      blueprint: makeBlueprint({
        tasks: [makeTask('1.1', 'A'), makeTask('1.2', 'B'), makeTask('1.3', 'C')],
      }),
      blueprintPath: 'blueprints/in-progress/plan/_overview.md',
      blueprintSlug: 'in-progress/plan',
    })
    const launch = buildBlueprintExecutionLaunchCommand(spec)
    expect(launch.args[1]).toMatch(/^\d+:executor$/)
  })
})

// ---------------------------------------------------------------------------
// buildBlueprintExecutionControlCommand
// ---------------------------------------------------------------------------

describe('buildBlueprintExecutionControlCommand', () => {
  it.each([
    ['status', 'status'],
    ['resume', 'resume'],
    ['stop', 'shutdown'],
  ] as const)('action %s maps to subcommand %s', (action, expectedSubcmd) => {
    const cmd = buildBlueprintExecutionControlCommand('omx-team', action, 'exec-123')
    expect(cmd.command).toBe('omx')
    expect(cmd.args).toEqual(['team', expectedSubcmd, 'exec-123'])
  })

  it('throws for unsupported backend', () => {
    expect(() =>
      buildBlueprintExecutionControlCommand(
        'unknown-backend' as BlueprintExecutionBackend,
        'status',
        'exec-123',
      ),
    ).toThrow(/Unsupported execution backend/)
  })
})

// ---------------------------------------------------------------------------
// parseTeamExecutionId
// ---------------------------------------------------------------------------

describe('parseTeamExecutionId', () => {
  it('extracts team id from launch output', () => {
    const output = 'Team started: my-team-abc\nsome other line'
    expect(parseTeamExecutionId(output)).toBe('my-team-abc')
  })

  it('is case-insensitive on "Team started:"', () => {
    const output = 'TEAM STARTED: uppercase-team'
    expect(parseTeamExecutionId(output)).toBe('uppercase-team')
  })

  it('trims whitespace from team id', () => {
    expect(parseTeamExecutionId('Team started:   spaced-team  \n')).toBe('spaced-team')
  })

  it('throws when team id not found', () => {
    expect(() => parseTeamExecutionId('nothing here')).toThrow(
      /Could not determine OMX team identity/,
    )
  })
})

// ---------------------------------------------------------------------------
// parseOmxTeamApiResponse
// ---------------------------------------------------------------------------

describe('parseOmxTeamApiResponse', () => {
  it('returns data on ok response', () => {
    const result = parseOmxTeamApiResponse<{ tasks: string[] }>(
      JSON.stringify({ ok: true, data: { tasks: ['t1'] } }),
      'list-tasks',
    )
    expect(result).toEqual({ tasks: ['t1'] })
  })

  it('throws on non-ok response with error message', () => {
    expect(() =>
      parseOmxTeamApiResponse(
        JSON.stringify({ ok: false, error: { message: 'Not found' } }),
        'list-tasks',
      ),
    ).toThrow('Not found')
  })

  it('throws with code in message when no message field', () => {
    expect(() =>
      parseOmxTeamApiResponse(
        JSON.stringify({ ok: false, error: { code: 'ENOENT' } }),
        'list-tasks',
      ),
    ).toThrow(/ENOENT/)
  })

  it('throws when data is absent on ok response', () => {
    expect(() => parseOmxTeamApiResponse(JSON.stringify({ ok: true }), 'list-tasks')).toThrow(
      /returned no data/,
    )
  })

  it('throws on malformed JSON', () => {
    expect(() => parseOmxTeamApiResponse('{bad json}', 'list-tasks')).toThrow(
      /Failed to parse OMX team api/,
    )
  })
})

// ---------------------------------------------------------------------------
// resolveControlStatus
// ---------------------------------------------------------------------------

describe('resolveControlStatus', () => {
  it.each([
    ['stop', 'stopped'],
    ['status', 'running'],
    ['resume', 'running'],
  ] as const)('action %s → status %s', (action, expected) => {
    expect(resolveControlStatus(action)).toBe(expected)
  })
})

// ---------------------------------------------------------------------------
// uniqueStrings
// ---------------------------------------------------------------------------

describe('uniqueStrings', () => {
  it('deduplicates', () => {
    expect(uniqueStrings(['a', 'b', 'a'])).toEqual(['a', 'b'])
  })

  it('trims whitespace', () => {
    expect(uniqueStrings(['  a  ', 'b'])).toEqual(['a', 'b'])
  })

  it('filters empty strings', () => {
    expect(uniqueStrings(['a', '', '  '])).toEqual(['a'])
  })
})

// ---------------------------------------------------------------------------
// isMissingFileError
// ---------------------------------------------------------------------------

describe('isMissingFileError', () => {
  it('returns true for ENOENT error', () => {
    const err = Object.assign(new Error('not found'), { code: 'ENOENT' })
    expect(isMissingFileError(err)).toBe(true)
  })

  it('returns false for other error codes', () => {
    const err = Object.assign(new Error('permission denied'), { code: 'EACCES' })
    expect(isMissingFileError(err)).toBe(false)
  })

  it('returns false for non-object', () => {
    expect(isMissingFileError('string error')).toBe(false)
    expect(isMissingFileError(null)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// buildListTasksVerificationCommand
// ---------------------------------------------------------------------------

describe('buildListTasksVerificationCommand', () => {
  it('produces omx list-tasks command with team_name', () => {
    const cmd = buildListTasksVerificationCommand('my-team')
    expect(cmd).toContain('omx team api list-tasks')
    expect(cmd).toContain('my-team')
    expect(cmd).toContain('--json')
  })
})

// ---------------------------------------------------------------------------
// toProjectRelativePath
// ---------------------------------------------------------------------------

describe('toProjectRelativePath', () => {
  it('returns posix-style relative path', () => {
    const rel = toProjectRelativePath('/project', '/project/src/foo.ts')
    expect(rel).toBe('src/foo.ts')
  })
})

// ---------------------------------------------------------------------------
// Path resolution helpers
// ---------------------------------------------------------------------------

describe('resolveRuntimeSnapshotRelativePath', () => {
  it('returns a string containing the executionId', () => {
    const p = resolveRuntimeSnapshotRelativePath('exec-abc')
    expect(p).toContain('exec-abc')
  })
})

describe('resolveTeamStateRelativePath', () => {
  it('contains /team/<executionId>', () => {
    const p = resolveTeamStateRelativePath('exec-abc')
    expect(p).toContain('/team/exec-abc')
  })
})

describe('resolveBridgeRelativePath', () => {
  it('returns a string containing the executionId', () => {
    const p = resolveBridgeRelativePath('omx-team', 'exec-abc')
    expect(p).toContain('exec-abc')
  })
})

// ---------------------------------------------------------------------------
// buildBlueprintExecutionRuntimePaths
// ---------------------------------------------------------------------------

describe('buildBlueprintExecutionRuntimePaths', () => {
  it('includes bridgePath, runtimeSnapshotPath, teamStateRoot in artifactPaths', () => {
    const paths = buildBlueprintExecutionRuntimePaths('omx-team', 'exec-xyz', null)
    expect(paths.artifactPaths).toContain(paths.bridgePath)
    expect(paths.artifactPaths).toContain(paths.runtimeSnapshotPath)
    expect(paths.artifactPaths).toContain(paths.teamStateRoot)
  })

  it('merges artifact paths from provided artifacts', () => {
    const paths = buildBlueprintExecutionRuntimePaths('omx-team', 'exec-xyz', {
      artifacts: ['dist/output.js'],
      verifications: [],
    })
    expect(paths.artifactPaths).toContain('dist/output.js')
  })

  it('carries logPath from artifacts', () => {
    const paths = buildBlueprintExecutionRuntimePaths('omx-team', 'exec-xyz', {
      artifacts: [],
      verifications: [],
      logPath: 'logs/run.log',
    })
    expect(paths.logPath).toBe('logs/run.log')
  })

  it('logPath is undefined when artifacts has no logPath', () => {
    const paths = buildBlueprintExecutionRuntimePaths('omx-team', 'exec-xyz', null)
    expect(paths.logPath).toBeUndefined()
  })
})
