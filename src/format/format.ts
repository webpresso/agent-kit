export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) {
    return '0 B'
  }

  const sign = bytes < 0 ? '-' : ''
  let value = Math.abs(bytes)
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const formatted = unitIndex === 0 ? String(value) : value.toFixed(value >= 10 ? 1 : 2)
  return `${sign}${formatted.replace(/\.0+$/, '')} ${units[unitIndex]}`
}
