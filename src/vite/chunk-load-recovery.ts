export interface ChunkLoadRecoveryStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface ChunkLoadRecoveryEvent {
  preventDefault?: () => void
}

export interface ChunkLoadRecoveryTarget {
  addEventListener(
    type: 'vite:preloadError',
    listener: (event: ChunkLoadRecoveryEvent) => void,
  ): void
}

export interface InstallChunkLoadRecoveryOptions {
  target?: ChunkLoadRecoveryTarget
  storage?: ChunkLoadRecoveryStorage
  reload?: () => void
  key?: string
}

const DEFAULT_RELOAD_KEY = 'vite-preload-error-reloaded'
const installedTargets = new WeakSet<object>()
let memoryReloaded = false

export function installChunkLoadRecovery(options: InstallChunkLoadRecoveryOptions = {}): boolean {
  const target = options.target ?? getDefaultTarget()
  if (!target) return false
  if (installedTargets.has(target)) return false

  const storage = options.storage ?? getDefaultStorage()
  const reload = options.reload ?? getDefaultReload()
  const key = options.key ?? DEFAULT_RELOAD_KEY

  target.addEventListener('vite:preloadError', (event) => {
    event.preventDefault?.()
    if (hasReloaded(storage, key)) return
    markReloaded(storage, key)
    reload()
  })
  installedTargets.add(target)
  return true
}

function hasReloaded(storage: ChunkLoadRecoveryStorage | undefined, key: string): boolean {
  if (!storage) return memoryReloaded
  try {
    return storage.getItem(key) === '1'
  } catch {
    return memoryReloaded
  }
}

function markReloaded(storage: ChunkLoadRecoveryStorage | undefined, key: string): void {
  memoryReloaded = true
  if (!storage) return
  try {
    storage.setItem(key, '1')
  } catch {
    // A private-mode or denied storage write should not prevent last-resort recovery.
  }
}

function getDefaultTarget(): ChunkLoadRecoveryTarget | undefined {
  const candidate = globalThis as {
    window?: { addEventListener?: ChunkLoadRecoveryTarget['addEventListener'] }
    addEventListener?: ChunkLoadRecoveryTarget['addEventListener']
  }
  const target = candidate.window ?? candidate
  if (typeof target.addEventListener !== 'function') return undefined
  return target as ChunkLoadRecoveryTarget
}

function getDefaultStorage(): ChunkLoadRecoveryStorage | undefined {
  const candidate = globalThis as {
    window?: { sessionStorage?: ChunkLoadRecoveryStorage }
    sessionStorage?: ChunkLoadRecoveryStorage
  }
  return candidate.window?.sessionStorage ?? candidate.sessionStorage
}

function getDefaultReload(): () => void {
  return () => {
    const candidate = globalThis as {
      window?: { location?: { reload?: () => void } }
      location?: { reload?: () => void }
    }
    const reload = candidate.window?.location?.reload ?? candidate.location?.reload
    reload?.()
  }
}
