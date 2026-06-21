import type { DbBranchCapabilityDescriptor } from './types.js'

export const NEON_DB_BRANCH_PROVIDER: DbBranchCapabilityDescriptor = {
  provider: 'neon',
  mode: 'managed',
  supportsClone: true,
  supportsTtl: true,
  supportsCleanup: true,
}

export const XATA_FUTURE_DB_BRANCH_PROVIDER: DbBranchCapabilityDescriptor = {
  provider: 'xata',
  mode: 'future',
  supportsClone: true,
  supportsTtl: true,
  supportsCleanup: true,
}
