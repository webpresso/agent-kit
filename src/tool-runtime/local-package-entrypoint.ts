import { existsSync } from 'node:fs'
import { basename, delimiter, dirname, join, resolve } from 'node:path'

function findNearestPackageJson(startDirectory: string): string | undefined {
  let directory = resolve(startDirectory)

  while (true) {
    const candidate = join(directory, 'package.json')
    if (existsSync(candidate)) {
      return candidate
    }

    const parent = dirname(directory)
    if (parent === directory) {
      return undefined
    }

    directory = parent
  }
}

export function resolveLocalPackageEntrypoint(
  startDirectory: string,
  packageName: string,
  entryRelativePath: string,
): string | undefined {
  const packageJsonPath = findNearestPackageJson(startDirectory)
  let directory = packageJsonPath ? dirname(packageJsonPath) : resolve(startDirectory)

  while (true) {
    const candidatePackageJson = join(directory, 'node_modules', packageName, 'package.json')
    if (existsSync(candidatePackageJson)) {
      return join(dirname(candidatePackageJson), entryRelativePath)
    }

    const parent = dirname(directory)
    if (parent === directory) {
      return undefined
    }

    directory = parent
  }
}

function isNodeExecutablePath(executablePath: string): boolean {
  return /^node(?:\.exe)?$/iu.test(basename(executablePath))
}

function resolveExecutableFromPath(name: string): string | undefined {
  const searchPath = process.env.PATH
  if (!searchPath) {
    return undefined
  }

  const candidates =
    process.platform === 'win32'
      ? [name, `${name}.exe`, `${name}.cmd`]
      : [name]

  for (const segment of searchPath.split(delimiter)) {
    if (!segment) {
      continue
    }

    for (const candidateName of candidates) {
      const candidatePath = join(segment, candidateName)
      if (existsSync(candidatePath)) {
        return candidatePath
      }
    }
  }

  return undefined
}

export function resolveNodeRuntimeCommand(): string {
  if (isNodeExecutablePath(process.execPath)) {
    return process.execPath
  }

  return resolveExecutableFromPath('node') ?? process.execPath
}
