import { spawnSync } from 'node:child_process'

const ALREADY_PUBLISHED_PATTERNS = [
  /cannot publish over the previously published version/i,
  /cannot publish over the previously published versions/i,
  /you cannot publish over the previously published version/i,
  /you cannot publish over the previously published versions/i,
]

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: 'pipe',
    env: process.env,
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  return result
}

function exitCode(result: ReturnType<typeof run>): number {
  return result.status ?? 1
}

const buildResult = run('pnpm', ['run', 'build'])
if (exitCode(buildResult) !== 0) {
  process.exit(exitCode(buildResult))
}

const publishResult = run('npm', ['publish', '--provenance', '--access', 'public'])
if (exitCode(publishResult) === 0) {
  process.exit(0)
}

const combinedOutput = `${publishResult.stdout ?? ''}\n${publishResult.stderr ?? ''}`
if (ALREADY_PUBLISHED_PATTERNS.some((pattern) => pattern.test(combinedOutput))) {
  process.stdout.write('[release:publish] version already published; treating as success\n')
  process.exit(0)
}

process.exit(exitCode(publishResult))
