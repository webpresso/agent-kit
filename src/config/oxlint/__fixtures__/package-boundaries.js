// Test fixture: minimal package-boundaries.js for testing tier-boundaries plugin
// In real usage, consumers provide this file at their repo root.

export const PACKAGE_BOUNDARIES = {
  utils: { group: 'foundation', tier: 0 },
  types: { group: 'foundation', tier: 0 },
  database: { group: 'core', tier: 1 },
  ui: { group: 'core', tier: 1 },
  'app-core': { group: 'feature', tier: 2 },
  'cli-wp': { group: 'apps', tier: 3 },
}

export const TIER_TAGS = {
  0: 'tier:foundation',
  1: 'tier:core',
  2: 'tier:feature',
  3: 'tier:leaf',
}

export const PACKAGE_GROUPS = Object.fromEntries(
  Object.entries(PACKAGE_BOUNDARIES).map(([name, metadata]) => [name, metadata.group]),
)

export const PACKAGE_TIERS = Object.fromEntries(
  Object.entries(PACKAGE_BOUNDARIES).map(([name, metadata]) => [name, metadata.tier]),
)

export const PACKAGE_CONTRACTS = Object.fromEntries(
  Object.entries(PACKAGE_BOUNDARIES)
    .filter(([, metadata]) => metadata.contract)
    .map(([name, metadata]) => [name, metadata.contract]),
)
