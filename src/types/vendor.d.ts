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

declare module '@webpresso/ctx-rs' {
  export interface CtxRsUnavailableStatus {
    readonly status: 'unavailable'
  }

  export interface CtxRsSearchHit {
    readonly content: string
    readonly source: string
    readonly rank: number
  }

  export interface CtxRsExecuteResult {
    readonly exitCode: number
    readonly outputBytes: number
    readonly indexed: boolean
    readonly summary: string
  }

  export interface CtxRsSnapshotResult {
    readonly snapshotId: string
    readonly eventCount: number
    readonly complete: boolean
  }

  export interface CtxRsSessionEvent {
    readonly sessionId: string
    readonly eventId: string
    readonly ts: number
    readonly toolName: string
    readonly content: string
  }

  export function loadNativeBinding(): object | null
  export function index(
    dbPath: string,
    source: string,
    content: string,
    replaceExisting: boolean,
  ): CtxRsUnavailableStatus | number
  export function search(
    dbPath: string,
    query: string,
    limit: number,
    source: string | null,
  ): CtxRsUnavailableStatus | CtxRsSearchHit[]
  export function fetchAndIndex(
    dbPath: string,
    url: string,
  ): Promise<
    | CtxRsUnavailableStatus
    | {
        readonly url: string
        readonly chunkCount: number
        readonly sourceLabel: string
      }
  >
  export function captureEvent(
    dbPath: string,
    sessionId: string,
    eventId: string,
    toolName: string,
    content: string,
  ): CtxRsUnavailableStatus | true
  export function snapshot(
    dbPath: string,
    agentId: string,
    capMs: number,
  ): CtxRsUnavailableStatus | CtxRsSnapshotResult
  export function restore(
    dbPath: string,
    agentId: string,
    query: string,
    limit: number,
  ): CtxRsUnavailableStatus | CtxRsSessionEvent[]
  export function executeSandboxed(
    dbPath: string,
    command: string,
    label: string,
  ): Promise<CtxRsExecuteResult>
}

declare module 'p-queue' {
  export interface PQueueOptions {
    concurrency?: number
    timeout?: number
    throwOnTimeout?: boolean
  }

  export default class PQueue {
    constructor(options?: PQueueOptions)
    add<T>(task: () => Promise<T> | T): Promise<T | undefined>
  }
}
