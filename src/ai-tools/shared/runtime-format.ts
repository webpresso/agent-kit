export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return String(error)
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) {
    return `${bytes} B`
  }

  if (Math.abs(bytes) < 1024) {
    return `${bytes} B`
  }

  const units = ['KiB', 'MiB', 'GiB', 'TiB']
  let value = bytes
  let unitIndex = -1

  while (Math.abs(value) >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(1)} ${units[unitIndex] ?? 'PiB'}`
}
