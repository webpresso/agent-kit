import { execSync } from 'node:child_process'

const UI_PATTERNS = [
  /\.tsx$/,
  /\.jsx$/,
  /\.vue$/,
  /\.svelte$/,
  /^apps\/client\//,
  /^apps\/web\//,
] as const

export function detectUiChanges(cwd: string): boolean {
  try {
    const changed = execSync('git diff --name-only HEAD', { cwd, encoding: 'utf-8', timeout: 5000 })
    return changed.split('\n').some(f => UI_PATTERNS.some(p => p.test(f)))
  } catch {
    return false
  }
}
