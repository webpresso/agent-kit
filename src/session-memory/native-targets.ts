export interface SessionMemoryNativeTarget {
  readonly id: string
  readonly os: NodeJS.Platform
  readonly cpu: NodeJS.Architecture
  readonly packageName: string
  readonly addonFilename: 'session_memory_napi.node'
}

export const SESSION_MEMORY_NATIVE_ADDON_FILENAME = 'session_memory_napi.node'

export const SESSION_MEMORY_NATIVE_TARGETS: readonly SessionMemoryNativeTarget[] = [
  {
    id: 'darwin-x64',
    os: 'darwin',
    cpu: 'x64',
    packageName: '@webpresso/agent-kit-session-memory-darwin-x64',
    addonFilename: SESSION_MEMORY_NATIVE_ADDON_FILENAME,
  },
  {
    id: 'darwin-arm64',
    os: 'darwin',
    cpu: 'arm64',
    packageName: '@webpresso/agent-kit-session-memory-darwin-arm64',
    addonFilename: SESSION_MEMORY_NATIVE_ADDON_FILENAME,
  },
  {
    id: 'linux-x64',
    os: 'linux',
    cpu: 'x64',
    packageName: '@webpresso/agent-kit-session-memory-linux-x64',
    addonFilename: SESSION_MEMORY_NATIVE_ADDON_FILENAME,
  },
  {
    id: 'linux-arm64',
    os: 'linux',
    cpu: 'arm64',
    packageName: '@webpresso/agent-kit-session-memory-linux-arm64',
    addonFilename: SESSION_MEMORY_NATIVE_ADDON_FILENAME,
  },
  {
    id: 'win32-x64',
    os: 'win32',
    cpu: 'x64',
    packageName: '@webpresso/agent-kit-session-memory-win32-x64',
    addonFilename: SESSION_MEMORY_NATIVE_ADDON_FILENAME,
  },
  {
    id: 'win32-arm64',
    os: 'win32',
    cpu: 'arm64',
    packageName: '@webpresso/agent-kit-session-memory-win32-arm64',
    addonFilename: SESSION_MEMORY_NATIVE_ADDON_FILENAME,
  },
] as const

export function resolveSessionMemoryNativeTarget(
  platform: NodeJS.Platform = process.platform,
  arch: NodeJS.Architecture = process.arch,
): SessionMemoryNativeTarget | undefined {
  return SESSION_MEMORY_NATIVE_TARGETS.find(
    (target) => target.os === platform && target.cpu === arch,
  )
}

export function sessionMemoryNativePackageDirName(packageName: string): string {
  return packageName.split('/').at(-1) ?? packageName
}
