#!/usr/bin/env bun

import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

interface RunResult {
  readonly command: string
  readonly ok: boolean
  readonly detail: string
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(SCRIPT_DIR, '..')
const setupOnly = process.argv.includes('--setup-only')
const keep = process.argv.includes('--keep')
const includeMutation = process.argv.includes('--include-mutation')
const skipBuild = process.argv.includes('--skip-build')

const requiredFiles = [
  'tsconfig.json',
  'vitest.config.ts',
  'oxlint.config.ts',
  'stryker.config.ts',
  'playwright.config.ts',
  'src/quality-sample.ts',
  'src/quality-sample.test.ts',
  'e2e/fixtures/smoke.html',
  'e2e/smoke.spec.ts',
] as const

function run(
  command: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
  timeoutMs = 5 * 60 * 1000,
): RunResult {
  try {
    execFileSync(command, [...args], {
      cwd,
      env,
      encoding: 'utf8',
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { command: [command, ...args].join(' '), ok: true, detail: 'ok' }
  } catch (error) {
    const failed = error as { status?: number; stdout?: string; stderr?: string }
    const output = `${failed.stdout ?? ''}${failed.stderr ?? ''}`.trim()
    return {
      command: [command, ...args].join(' '),
      ok: false,
      detail: `exit ${failed.status ?? 1}${output ? `: ${output.slice(0, 800)}` : ''}`,
    }
  }
}

function runOrThrow(
  command: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return execFileSync(command, [...args], {
    cwd,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function packCurrentArtifact(): string {
  const raw = runOrThrow('npm', ['pack', '--json'], ROOT)
  const parsed = JSON.parse(raw.match(/\[.*\]/s)?.[0] ?? '[]') as Array<{ filename?: string }>
  const filename = parsed[0]?.filename
  if (!filename) {
    throw new Error('npm pack did not report a filename')
  }
  const packedPath = resolve(ROOT, filename)
  const stagedPath = join(tempRoot, filename)
  copyFileSync(packedPath, stagedPath)
  rmSync(packedPath, { force: true })
  return stagedPath
}

function assertSetupContract(repo: string): RunResult[] {
  const results: RunResult[] = []
  for (const file of requiredFiles) {
    const target = join(repo, file)
    results.push({
      command: `assert exists ${file}`,
      ok: existsSync(target),
      detail: existsSync(target) ? 'ok' : 'missing',
    })
  }

  const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  for (const script of ['lint', 'typecheck', 'test', 'mutation', 'test:mutation', 'e2e', 'qa']) {
    results.push({
      command: `assert package script ${script}`,
      ok: typeof pkg.scripts?.[script] === 'string',
      detail: pkg.scripts?.[script] ?? 'missing',
    })
  }
  for (const dep of [
    '@webpresso/agent-kit',
    'typescript',
    'vitest',
    '@playwright/test',
    '@stryker-mutator/core',
    '@stryker-mutator/vitest-runner',
  ]) {
    results.push({
      command: `assert authoring dependency ${dep}`,
      ok: typeof pkg.devDependencies?.[dep] === 'string',
      detail: pkg.devDependencies?.[dep] ?? 'missing',
    })
  }
  return results
}

function pinPackedAgentKitDependency(repo: string, tarballPath: string): void {
  const packageJsonPath = join(repo, 'package.json')
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    devDependencies?: Record<string, string>
  }
  pkg.devDependencies ??= {}
  pkg.devDependencies['@webpresso/agent-kit'] = `file:${tarballPath}`
  writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`)
}

const tempRoot = mkdtempSync(join(tmpdir(), 'wp-public-consumer-smoke-'))
const repo = join(tempRoot, 'repo')
const home = join(tempRoot, 'home')
let tarball = ''
let canContinue = true
const results: RunResult[] = []

try {
  if (!skipBuild) {
    const build = run('vp', ['run', 'build'], ROOT)
    results.push(build)
    if (!build.ok) {
      canContinue = false
    }
  }
  if (canContinue) {
    tarball = packCurrentArtifact()
    results.push(run('git', ['init', repo], tempRoot))
    results.push(run('npm', ['init', '--yes'], repo))

    const setupEnv = {
      ...process.env,
      CI: 'true',
      HOME: home,
      WP_SKIP_CLAUDE_PLUGIN: '1',
      WP_SKIP_CONTEXT_MODE: '1',
      WP_SKIP_GSTACK: '1',
      WP_SKIP_RTK: '1',
      WP_SKIP_UPDATE_CHECK: '1',
    }
    results.push(
      run(
        'npm',
        ['exec', '--yes', '--package', tarball, '--', 'wp', 'setup', '--yes', '--host', 'none'],
        repo,
        setupEnv,
      ),
    )
    results.push(...assertSetupContract(repo))

    if (!setupOnly) {
      pinPackedAgentKitDependency(repo, tarball)
      const install = run('npm', ['install'], repo, setupEnv, 10 * 60 * 1000)
      results.push(install)
      if (install.ok) {
        results.push(run('npm', ['run', 'lint'], repo, setupEnv))
        results.push(run('npm', ['run', 'typecheck'], repo, setupEnv))
        results.push(run('npm', ['run', 'test'], repo, setupEnv))
        if (includeMutation) {
          results.push(run('npm', ['run', 'mutation'], repo, setupEnv, 10 * 60 * 1000))
        }
        results.push(run('npm', ['run', 'e2e'], repo, setupEnv))
        results.push(run('npm', ['run', 'qa'], repo, setupEnv))
      }
    }
  }
} finally {
  if (tarball && !keep) rmSync(tarball, { force: true })
  if (!keep) rmSync(tempRoot, { recursive: true, force: true })
}

const failed = results.filter((result) => !result.ok)
console.log(`Public consumer smoke: ${failed.length === 0 ? 'PASS' : 'FAIL'}`)
for (const result of results) {
  console.log(`[${result.ok ? 'PASS' : 'FAIL'}] ${result.command}: ${result.detail}`)
}

if (failed.length > 0) {
  if (keep) console.log(`Kept smoke workspace: ${tempRoot}`)
  process.exit(1)
}
