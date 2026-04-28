import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { consumerPackageRoot, requireFromConsumer } from './consumer-package.js'

const GENERATED_RUNTIME_DEP_NAMES = [
  '@tanstack/react-query',
  'graphql-request',
  'graphql-tag',
] as const

export const webpressoGeneratedRuntimeDedupe = [...GENERATED_RUNTIME_DEP_NAMES]

function findGeneratedPackageRoot(startDirectory: string): string {
  let directory = startDirectory
  while (true) {
    const candidate = join(directory, '.webpresso', 'generated')
    if (existsSync(candidate)) return candidate

    const parent = dirname(directory)
    if (parent === directory) return candidate
    directory = parent
  }
}

function resolveConsumerDependency(name: string): string | undefined {
  try {
    return requireFromConsumer.resolve(name)
  } catch {
    return undefined
  }
}

const generatedPackageRoot = findGeneratedPackageRoot(consumerPackageRoot ?? process.cwd())

export const webpressoGeneratedRuntimeAliases = [
  {
    find: /^@webpresso\/generated\/config$/,
    replacement: `${generatedPackageRoot}/config/index.ts`,
  },
  {
    find: /^@webpresso\/generated\/(.*)$/,
    replacement: `${generatedPackageRoot}/$1`,
  },
  ...GENERATED_RUNTIME_DEP_NAMES.flatMap((name) => {
    const replacement = resolveConsumerDependency(name)
    return replacement ? [{ find: name, replacement }] : []
  }),
]
