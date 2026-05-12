declare module 'proper-lockfile' {
  interface LockOptions {
    retries?: number | { retries: number; minTimeout: number; maxTimeout: number; factor?: number }
    stale?: number
    update?: number
    realpath?: boolean
    fs?: typeof import('node:fs')
  }
  interface UnlockOptions {
    realpath?: boolean
    fs?: typeof import('node:fs')
  }
  interface CheckOptions {
    realpath?: boolean
    stale?: number
    fs?: typeof import('node:fs')
  }

  function lock(file: string, options?: LockOptions): Promise<() => Promise<void>>
  function unlock(file: string, options?: UnlockOptions): Promise<void>
  function check(file: string, options?: CheckOptions): Promise<boolean>
  function lockSync(file: string, options?: LockOptions): () => void
  function unlockSync(file: string, options?: UnlockOptions): void
  function checkSync(file: string, options?: CheckOptions): boolean

  export { lock, unlock, check, lockSync, unlockSync, checkSync }
  export default { lock, unlock, check, lockSync, unlockSync, checkSync }
}

declare module 'bun:sqlite' {
  interface DatabaseOptions {
    readonly?: boolean
    create?: boolean
    readwrite?: boolean
  }
  interface Statement<ReturnType> {
    get(...params: unknown[]): ReturnType | null
    all(...params: unknown[]): ReturnType[]
    run(...params: unknown[]): void
  }
  class Database {
    constructor(filename: string, options?: DatabaseOptions)
    prepare<ReturnType = Record<string, unknown>, _Params = unknown[]>(sql: string): Statement<ReturnType>
    close(): void
  }
  export { Database }
}
