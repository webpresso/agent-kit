#!/usr/bin/env bun
/**
 * scripts/release.mjs — agent-kit release engineering.
 *
 * WHY this exists (from blueprint Task 5.1, F1 finding):
 *   The agent-kit Claude Code plugin references hook bins and an MCP server
 *   under `${CLAUDE_PLUGIN_ROOT}/dist/...`. Marketplace install is a `git
 *   clone` of the repo at the marketplace ref, but `dist/` is in `.gitignore`
 *   on `main` (and `git ls-files dist | wc -l` returns 0). Consumers would
 *   land at a ref where the bins do not exist → hooks 404, MCP server
 *   refuses to start.
 *
 * Mitigation: this script commits `dist/` ONLY at release tags so `main`
 * stays clean and the marketplace can pin to tag refs that actually contain
 * the build output.
 *
 * Sequence:
 *   1. Validate the working tree is clean (no unstaged or staged changes).
 *   2. Run `pnpm build` to populate `dist/`.
 *   3. Read the version from `package.json`.
 *   4. Create/verify the annotated tag `v<version>` on the current HEAD
 *      (the published version-bump commit on `main`).
 *   5. Create a separate compatibility branch `release/v<version>` from that
 *      tagged commit.
 *   6. `git add -f dist/` so the gitignore does not block the addition.
 *   7. Create the dist compatibility commit on the release branch.
 *   8. Push the tag and branch to `origin` (skipped in --dry-run).
 *   9. Restore the original branch (always — even on failure mid-flight,
 *      we attempt restoration in a finally-style guard).
 *
 * --dry-run is the SAFE DEFAULT. The caller must pass --no-dry-run to
 * actually push to a remote. This is intentional: releases are infrequent,
 * irreversible (tags are public), and accidentally invoking the bare
 * `pnpm release` should never push.
 *
 * Note: in dry-run mode the local tag + branch + dist commit ARE created (so
 * the user/test fixture can inspect them). Only the remote push steps are
 * skipped. Re-running dry-run after the first invocation will fail because the
 * local tag + branch already exist — clean them up before retrying.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO_ROOT = process.cwd()

function parseFlags(argv) {
  const flags = new Set(argv.slice(2))
  // Default: dry-run. Caller must pass --no-dry-run to actually push.
  let dryRun = true
  if (flags.has('--no-dry-run')) dryRun = false
  if (flags.has('--dry-run')) dryRun = true
  return { dryRun }
}

function log(line) {
  process.stdout.write(`${line}\n`)
}

function fail(line) {
  process.stderr.write(`[release] ERROR: ${line}\n`)
  process.exit(1)
}

/**
 * Run a command, inheriting stdio so the user sees git/pnpm output live.
 * Throws on non-zero exit.
 */
function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    ...opts,
  })
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} exited with status ${result.status ?? 'null'}`)
  }
}

/**
 * Run a command and capture stdout (trimmed). Used for git rev-parse and
 * similar query commands where we need the value, not just side effects.
 */
function capture(cmd, args) {
  const result = spawnSync(cmd, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed: ${result.stderr ?? ''}`)
  }
  return (result.stdout ?? '').toString().trim()
}

function assertCleanWorkingTree() {
  const status = capture('git', ['status', '--porcelain'])
  if (status.length > 0) {
    fail(
      'working tree is not clean. Commit, stash, or discard your changes before releasing.\n' +
        '       (run `git status` to see what is dirty.)',
    )
  }
}

function readPackageVersion() {
  const pkgPath = resolve(REPO_ROOT, 'package.json')
  let raw
  try {
    raw = readFileSync(pkgPath, 'utf8')
  } catch (err) {
    fail(`could not read package.json at ${pkgPath}: ${err.message}`)
  }
  const pkg = JSON.parse(raw)
  if (typeof pkg.version !== 'string' || pkg.version.length === 0) {
    fail('package.json#version is missing or not a string')
  }
  return pkg.version
}

function main() {
  const { dryRun } = parseFlags(process.argv)

  log(`[release] mode: ${dryRun ? 'dry-run (default)' : 'LIVE — will push to origin'}`)

  // 1. Clean tree check.
  log('[release] step 1/8: verifying clean working tree')
  assertCleanWorkingTree()

  // Capture original branch so we can restore at the end.
  const [originalBranch, publishedCommit] = capture('git', [
    'rev-parse',
    '--abbrev-ref',
    'HEAD',
    'HEAD',
  ]).split('\n')
  if (!originalBranch || !publishedCommit) fail('could not resolve current branch and HEAD')
  log(`[release] original branch: ${originalBranch}`)

  // 2. Build.
  log('[release] step 2/8: pnpm build')
  try {
    run('pnpm', ['build'])
  } catch (err) {
    fail(`pnpm build failed: ${err.message}`)
  }

  // 3. Read version + capture the mainline commit that should own the tag.
  const version = readPackageVersion()
  const tag = `v${version}`
  const releaseBranch = `release/${tag}`
  log(`[release] step 3/8: version is ${version} → tag ${tag}, branch ${releaseBranch}`)

  // 4. Tag the published/mainline commit explicitly before branching.
  log(`[release] step 4/8: tagging ${tag} on ${publishedCommit}`)
  let onReleaseBranch = false
  try {
    run('git', ['tag', '-a', tag, publishedCommit, '-m', tag])

    // 5. Create the compatibility branch from the tagged mainline commit.
    log(`[release] step 5/8: creating branch ${releaseBranch} from ${publishedCommit}`)
    run('git', ['checkout', '-b', releaseBranch, publishedCommit])
    onReleaseBranch = true

    // 6. Force-add dist/.
    log('[release] step 6/8: git add -f dist')
    run('git', ['add', '-f', 'dist'])

    // 7. Commit the compatibility dist artifacts on the branch.
    log('[release] step 7/8: creating compatibility dist commit')
    run('git', ['commit', '-m', `chore(release): ${tag} dist artifacts`])

    // 8. Push (or pretend to).
    if (dryRun) {
      log(
        `[release] step 8/8: [dry-run] would push tag ${tag} and branch ${releaseBranch} to origin`,
      )
      log('[release] [dry-run] no remote was contacted. Re-run with --no-dry-run to push.')
    } else {
      log(`[release] step 8/8: pushing tag ${tag} to origin`)
      run('git', ['push', 'origin', tag])
      log(`[release] step 8/8: pushing branch ${releaseBranch} to origin`)
      run('git', ['push', 'origin', releaseBranch])
    }
  } finally {
    // 9. Always restore the original branch so the user is not stranded
    // on the release branch (which has the dist/ commit on it).
    if (onReleaseBranch) {
      try {
        // `--force` (not used) would be needed if we'd dirtied the worktree,
        // but at this point dist/ is committed on the release branch and the
        // worktree is clean — a plain checkout works.
        run('git', ['checkout', originalBranch])
        log(`[release] restored original branch: ${originalBranch}`)
      } catch (err) {
        process.stderr.write(
          `[release] WARNING: failed to restore original branch ${originalBranch}: ${err.message}\n`,
        )
      }
    }
  }

  log('[release] done.')
}

try {
  main()
} catch (err) {
  fail(err instanceof Error ? err.message : String(err))
}
