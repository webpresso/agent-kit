import { defineConfig, mergeConfig } from 'vitest/config'
import vitestConfig from './vitest.config.js'

export default mergeConfig(
  vitestConfig,
  defineConfig({
    test: {
      // forks pool prevents IPC serialization crash (TypeError: Cannot convert object
      // to primitive value) in VitestTestRunner.errorToString with Stryker 9.x
      pool: 'forks',
      exclude: [
        ...(vitestConfig.test?.exclude ?? ['**/node_modules/**', '**/dist/**']),
        'src/hooks/pretool-guard/runner.test.ts',
        'src/cli/commands/init/init.e2e.test.ts',
        // spawns bun subprocess to run full CLI TypeScript on-the-fly; cold-start
        // exceeds the unit-test timeout in the forks pool
        'src/cli/commands/init/scaffolders/rtk/integration.test.ts',
        // spawns a long-lived bun CLI process for JSON-RPC MCP communication;
        // same cold-start problem, not suitable for Stryker mutation runner
        'src/mcp/server.integration.test.ts',
        // spawns bun subprocess (publish-webpresso.ts --dry-run); cold-start
        // exceeds the unit-test timeout in the forks pool
        'scripts/publish-webpresso.integration.test.ts',
        // spawns a real detached `node -e` child to verify the installer end-to-end;
        // Node cold-start under Stryker's forks pool exceeds the unit-test timeout
        'src/cli/auto-update/installer.integration.test.ts',
        // calls ingestAll (filesystem glob scan + SQLite writes) — heavyweight operation
        // not suitable for Stryker's forks pool unit-test timeout
        'src/mcp/blueprint-workflow.integration.test.ts',
        // spawns the real oxlint binary against the built dist config; gated on
        // build artifacts and not meaningful under Stryker's source-only run
        'src/config/oxlint/oxlintrc.integration.test.ts',
        // spawns real `git` (init/commit) + calls ingestAll to exercise projection
        // freshness recovery; subprocess + filesystem scan exceed the forks-pool
        // unit-test timeout
        'src/cli/commands/blueprint/db-commands.integration.test.ts',
        // scaffolds hooks + spawns the real generated `node bin/wp hook ...` command per
        // matrix row (one process each); cold-start exceeds the forks-pool unit timeout
        'src/hooks/__conformance__/boundary.smoke.test.ts',
        // host-sim e2e: spawns generated codex commands from a sibling cwd; spawn-heavy
        'src/hooks/__conformance__/host-sim.e2e.test.ts',
      ],
    },
  }),
)
