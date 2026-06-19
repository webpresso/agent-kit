export function isNewerVersion(latest: string, current: string): boolean {
  const l = latest.split('.').map((p) => parseInt(p, 10))
  const c = current.split('.').map((p) => parseInt(p, 10))
  const len = Math.max(l.length, c.length)
  for (let i = 0; i < len; i++) {
    const lv = l[i] ?? 0
    const cv = c[i] ?? 0
    if (Number.isNaN(lv) || Number.isNaN(cv)) return latest !== current
    if (lv > cv) return true
    if (lv < cv) return false
  }
  return false
}
