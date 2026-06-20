import type { CAC } from 'cac'

import {
  isSecretLikeMetadataText,
  readSecretsConfig,
  resolveSecretsConfigProfileEnvironment,
  sanitizeSecretsMetadataText,
  type SecretManagerName,
} from '#runtime/secrets-config.js'

export interface SecretsDoctorOptions {
  readonly cwd?: string
  readonly json?: boolean
  readonly profile?: string
  readonly stdout?: Pick<NodeJS.WriteStream, 'write'>
}

interface SecretsDoctorReport {
  readonly ok: boolean
  readonly configured: boolean
  readonly manager?: SecretManagerName
  readonly projectId?: string
  readonly projectLabel?: string
  readonly profile?: string
  readonly environment?: string
  readonly error?: string
}

function isSafeMetadataText(value: string): boolean {
  return !isSecretLikeMetadataText(value)
}

function writeLine(writer: Pick<NodeJS.WriteStream, 'write'>, message: string): void {
  writer.write(`${message}\n`)
}

function writeReport(writer: Pick<NodeJS.WriteStream, 'write'>, report: SecretsDoctorReport, json?: boolean): void {
  if (json) {
    writeLine(writer, JSON.stringify(report, null, 2))
    return
  }
  if (!report.ok) {
    writeLine(writer, report.error ?? 'Secret configuration is not ready.')
    return
  }
  writeLine(writer, 'configured: yes')
  writeLine(writer, `manager: ${report.manager}`)
  writeLine(writer, `projectId: ${report.projectId}`)
  if (report.profile) writeLine(writer, `profile: ${report.profile}`)
  if (report.environment) writeLine(writer, `environment: ${report.environment}`)
}

export async function runSecretsDoctorCommand(options: SecretsDoctorOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd()
  const profile = options.profile?.trim() || 'preview'
  const reportProfile = isSafeMetadataText(profile) ? profile : undefined
  const stdout = options.stdout ?? process.stdout

  try {
    const config = readSecretsConfig(cwd)
    if (!config) {
      const report: SecretsDoctorReport = {
        ok: false,
        configured: false,
        error: 'No secret manager configured. Run: wp config secrets setup',
      }
      writeReport(stdout, report, options.json)
      return 1
    }
    const environment = resolveSecretsConfigProfileEnvironment(profile, cwd)
    const report: SecretsDoctorReport = {
      ok: true,
      configured: true,
      manager: config.manager,
      projectId: config.projectId,
      ...(config.projectLabel ? { projectLabel: config.projectLabel } : {}),
      profile: reportProfile,
      environment,
    }
    writeReport(stdout, report, options.json)
    return 0
  } catch (error) {
    const report: SecretsDoctorReport = {
      ok: false,
      configured: false,
      ...(reportProfile ? { profile: reportProfile } : {}),
      error: sanitizeSecretsMetadataText(error instanceof Error ? error.message : String(error)),
    }
    writeReport(stdout, report, options.json)
    return 1
  }
}

export async function runSecretsCommand(
  action: string | undefined,
  options: SecretsDoctorOptions = {},
): Promise<number> {
  switch (action) {
    case 'doctor':
      return runSecretsDoctorCommand(options)
    default:
      throw new Error('Usage: wp secrets doctor --profile <profile> [--json]')
  }
}

export function registerSecretsCommand(cli: CAC): void {
  cli
    .command('secrets <action>', 'Secret orchestration commands (doctor)')
    .option('--profile <profile>', 'Secret profile to validate')
    .option('--json', 'Print JSON output')
    .action(async (action: string | undefined, options: SecretsDoctorOptions) =>
      runSecretsCommand(action, options),
    )
}
