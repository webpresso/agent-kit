import { runNoLegacyCliBinAudit } from '#cli/bundle/audits/no-legacy-cli-bin.js'
import { placeholderCommand, placeholderGroup } from '#cli/bundle/commands/helpers.js'
import type { CliCommand } from '@webpresso/cli-contract'

const SCOPE = 'Agent'

function command(name: string, description: string, run: () => void | Promise<void>): CliCommand {
  return {
    meta: { description, name },
    run,
  }
}

export const agentCommands = {
  audit: placeholderGroup(SCOPE, 'audit', 'Run packaged audits', {
    'blueprint-lifecycle': placeholderCommand(
      SCOPE,
      'blueprint-lifecycle',
      'Audit blueprint lifecycle state',
    ),
    'bucket-boundary': placeholderCommand(
      SCOPE,
      'bucket-boundary',
      'Audit package bucket boundaries',
    ),
    'bundle-budget': placeholderCommand(SCOPE, 'bundle-budget', 'Audit bundle size budgets'),
    'catalog-drift': placeholderCommand(SCOPE, 'catalog-drift', 'Audit catalog drift'),
    'commit-message': placeholderCommand(
      SCOPE,
      'commit-message',
      'Audit commit messages for Lore compliance',
    ),
    'docs-frontmatter': placeholderCommand(
      SCOPE,
      'docs-frontmatter',
      'Audit docs frontmatter contracts',
    ),
    mutation: placeholderCommand(SCOPE, 'mutation', 'Run mutation testing audits'),
    'no-legacy-cli-bin': command(
      'no-legacy-cli-bin',
      'Audit for active legacy CLI bin invocations',
      () => runNoLegacyCliBinAudit(),
    ),
    'no-relative-parent-imports': placeholderCommand(
      SCOPE,
      'no-relative-parent-imports',
      'Audit for parent-relative imports',
    ),
    quality: placeholderCommand(SCOPE, 'quality', 'Run the composite quality audit'),
    'tech-debt': placeholderCommand(SCOPE, 'tech-debt', 'Audit tech-debt records'),
    tph: placeholderCommand(SCOPE, 'tph', 'Run the TPH audit'),
    'tph-e2e': placeholderCommand(SCOPE, 'tph-e2e', 'Run the TPH E2E audit'),
  }),
  dev: placeholderCommand(SCOPE, 'dev', 'Run a manifest-backed development target'),
  docs: placeholderGroup(SCOPE, 'docs', 'Documentation tooling', {
    lint: placeholderCommand(SCOPE, 'lint', 'Lint blueprint documentation'),
  }),
  e2e: placeholderCommand(
    SCOPE,
    'e2e',
    'Build and run E2E commands through the portable agent surface',
  ),
  hooks: placeholderGroup(SCOPE, 'hooks', 'Verify plugin hook installation health', {
    doctor: placeholderCommand(SCOPE, 'doctor', 'Run hook installation health checks'),
  }),
  setup: placeholderCommand(SCOPE, 'setup', 'Scaffold a consumer repo with the agent surface'),
  skills: placeholderGroup(SCOPE, 'skills', 'Manage agent skills', {
    install: placeholderCommand(SCOPE, 'install', 'Install a bundled skill'),
    list: placeholderCommand(SCOPE, 'list', 'List bundled or installed skills'),
  }),
  symlink: placeholderGroup(SCOPE, 'symlink', 'Sync agent-surface files across IDE consumers', {
    check: placeholderCommand(SCOPE, 'check', 'Check agent-surface sync state'),
    import: placeholderCommand(SCOPE, 'import', 'Import an IDE-managed agent surface file'),
    sync: placeholderCommand(SCOPE, 'sync', 'Sync agent-surface files'),
  }),
  'tech-debt': placeholderGroup(SCOPE, 'tech-debt', 'Manage tech-debt lifecycle', {
    list: placeholderCommand(SCOPE, 'list', 'List tech-debt records'),
    new: placeholderCommand(SCOPE, 'new', 'Create a tech-debt record'),
    review: placeholderCommand(SCOPE, 'review', 'Review tech-debt records'),
  }),
  test: placeholderCommand(SCOPE, 'test', 'Run tests through the portable agent surface'),
} satisfies Record<string, CliCommand>
