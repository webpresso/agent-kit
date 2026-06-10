import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export const SOURCE_BLUEPRINT_MIGRATIONS_RELATIVE_DIR = 'src/blueprint/db/migrations'
export const PACKAGED_BLUEPRINT_MIGRATIONS_RELATIVE_DIR = 'dist/esm/blueprint/db/migrations'

function listSqlFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((entry) => entry.endsWith('.sql'))
    .sort()
}

function migrationContractError(rootDir: string, details: readonly string[]): Error {
  const expectedDir = join(rootDir, PACKAGED_BLUEPRINT_MIGRATIONS_RELATIVE_DIR)
  const sourceDir = join(rootDir, SOURCE_BLUEPRINT_MIGRATIONS_RELATIVE_DIR)
  return new Error(
    [
      `Missing or stale built blueprint migration SQL assets at ${expectedDir}.`,
      'The published runtime contract requires dist/esm/blueprint/db/migrations/*.sql.',
      `Authoring source remains ${sourceDir}; run the build so those SQL files are copied into dist before packing.`,
      ...details,
    ].join('\n'),
  )
}

export function syncBlueprintMigrationSqlAssets(rootDir: string): void {
  const sourceDir = join(rootDir, SOURCE_BLUEPRINT_MIGRATIONS_RELATIVE_DIR)
  if (!existsSync(sourceDir)) return

  const sourceSqlFiles = listSqlFiles(sourceDir)
  if (sourceSqlFiles.length === 0) {
    throw migrationContractError(rootDir, [`No authoring SQL files found in ${sourceDir}.`])
  }

  const targetDir = join(rootDir, PACKAGED_BLUEPRINT_MIGRATIONS_RELATIVE_DIR)
  mkdirSync(targetDir, { recursive: true })

  for (const existingFile of listSqlFiles(targetDir)) {
    if (!sourceSqlFiles.includes(existingFile)) {
      rmSync(join(targetDir, existingFile), { force: true })
    }
  }

  for (const file of sourceSqlFiles) {
    copyFileSync(join(sourceDir, file), join(targetDir, file))
  }
}

export function assertBuiltBlueprintMigrationSqlAssets(rootDir: string): void {
  const sourceDir = join(rootDir, SOURCE_BLUEPRINT_MIGRATIONS_RELATIVE_DIR)
  if (!existsSync(sourceDir)) return

  const sourceSqlFiles = listSqlFiles(sourceDir)
  if (sourceSqlFiles.length === 0) {
    throw migrationContractError(rootDir, [`No authoring SQL files found in ${sourceDir}.`])
  }

  const targetDir = join(rootDir, PACKAGED_BLUEPRINT_MIGRATIONS_RELATIVE_DIR)
  const targetSqlFiles = listSqlFiles(targetDir)
  const missingFiles = sourceSqlFiles.filter((file) => !targetSqlFiles.includes(file))
  const unexpectedFiles = targetSqlFiles.filter((file) => !sourceSqlFiles.includes(file))
  const contentMismatches = sourceSqlFiles.filter((file) => {
    if (!targetSqlFiles.includes(file)) return false
    return readFileSync(join(sourceDir, file), 'utf8') !== readFileSync(join(targetDir, file), 'utf8')
  })

  if (
    missingFiles.length === 0 &&
    unexpectedFiles.length === 0 &&
    contentMismatches.length === 0
  ) {
    return
  }

  const details = [
    missingFiles.length === 0 ? null : `Missing packaged SQL files: ${missingFiles.join(', ')}`,
    unexpectedFiles.length === 0 ? null : `Unexpected packaged SQL files: ${unexpectedFiles.join(', ')}`,
    contentMismatches.length === 0
      ? null
      : `Packaged SQL contents drifted from source: ${contentMismatches.join(', ')}`,
  ].filter((value): value is string => value !== null)

  throw migrationContractError(rootDir, details)
}

if (import.meta.main) {
  syncBlueprintMigrationSqlAssets(process.cwd())
}
