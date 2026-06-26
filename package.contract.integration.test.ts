import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createInstalledBlueprintMigrationSmokeScript } from "./scripts/packed-blueprint-migration-smoke.js";
import { resolveRuntimeTarget, runtimePackageDirName } from "./src/build/runtime-targets.js";
import { probeRuntimeTypecheckParity } from "./src/typecheck/runtime-parity.js";

const REPO_ROOT = process.cwd();
const PACKAGE_JSON_PATH = join(REPO_ROOT, "package.json");
const DIST_SENTINEL = join(REPO_ROOT, "dist", "esm", "index.js");
const MIGRATION_SENTINEL = join(
  REPO_ROOT,
  "dist",
  "esm",
  "blueprint",
  "db",
  "migrations",
  "0001_seed.sql",
);
const BLUEPRINT_MIGRATIONS_SOURCE_DIR = join(REPO_ROOT, "src", "blueprint", "db", "migrations");
const EXPECTED_BLUEPRINT_MIGRATION_SQL_FILES = readdirSync(BLUEPRINT_MIGRATIONS_SOURCE_DIR)
  .filter((file) => file.endsWith(".sql"))
  .sort();
const EXPECTED_BLUEPRINT_SCHEMA_VERSIONS = EXPECTED_BLUEPRINT_MIGRATION_SQL_FILES.map((file) =>
  Number.parseInt(file.slice(0, file.indexOf("_")), 10),
);
const ORIGINAL_PACKAGE_JSON_TEXT = readFileSync(PACKAGE_JSON_PATH, "utf8");
const PACK_LOCK_DIRECTORY = join(tmpdir(), "webpresso-agent-kit-npm-pack.lock");
const PACK_LOCK_OWNER_PATH = join(PACK_LOCK_DIRECTORY, "owner.json");
const PREPACK_PACKAGE_BACKUP_PATH = join(REPO_ROOT, ".package.json.prepack.backup");
let packedTarballTempRoot: string | undefined;

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code !== "ESRCH";
  }
}

function acquirePackLock(): () => void {
  const started = Date.now();
  while (true) {
    try {
      mkdirSync(PACK_LOCK_DIRECTORY);
      writeFileSync(
        PACK_LOCK_OWNER_PATH,
        JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
      );
      return () => rmSync(PACK_LOCK_DIRECTORY, { force: true, recursive: true });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== "EEXIST") throw error;
      try {
        const owner = JSON.parse(readFileSync(PACK_LOCK_OWNER_PATH, "utf8")) as {
          pid?: number;
        };
        if (typeof owner.pid === "number" && !isAlive(owner.pid)) {
          rmSync(PACK_LOCK_DIRECTORY, { force: true, recursive: true });
          continue;
        }
      } catch {
        // Fall back to mtime-based stale lock recovery below.
      }
      const ageMs = Date.now() - statSync(PACK_LOCK_DIRECTORY).mtimeMs;
      if (ageMs > 120_000) {
        rmSync(PACK_LOCK_DIRECTORY, { force: true, recursive: true });
        continue;
      }
      if (Date.now() - started > 60_000) {
        throw new Error(`Timed out waiting for npm pack lock at ${PACK_LOCK_DIRECTORY}`);
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
}

const FORBIDDEN_TARBALL_PATHS = [
  /^dist\/.*\.map$/,
  /^dist\/.*__integration__\//,
  /^dist\/.*__mocks__\//,
  /^dist\/.*runners\/evals\//,
  /^dist\/esm\/ai-prompts\//,
];

type PackedTarballArtifact = {
  tarballPath: string;
  paths: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};
let packedTarballArtifactCache: PackedTarballArtifact | undefined;
let packedDistBuilt = false;
let packedNativeRuntimeBuilt = false;

function parseNpmJson<T>(raw: string): T {
  const start = raw.indexOf("[");
  if (start === -1) {
    throw new Error(`npm JSON output missing JSON payload: ${raw}`);
  }
  return JSON.parse(raw.slice(start)) as T;
}

function ensureBuiltPackedDist() {
  if (packedDistBuilt) return;
  // Vitest globalSetup builds dist once before workers fork. Reuse that current
  // compiled tree when present; rebuilding inside the first package-surface
  // assertion can exceed the test's fixed 30s timeout and duplicates work.
  if (!existsSync(DIST_SENTINEL)) {
    execFileSync("./node_modules/.bin/tshy", [], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        HUSKY: "0",
      },
    });
    execFileSync("bun", ["src/build/normalize-tsconfig-json-exports.ts"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        HUSKY: "0",
      },
    });
  }
  if (!existsSync(MIGRATION_SENTINEL)) {
    execFileSync("bun", ["src/build/blueprint-migration-assets.ts"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        HUSKY: "0",
      },
    });
  }
  execFileSync("bun", ["scripts/chmod-bins.ts"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      HUSKY: "0",
    },
  });
  packedDistBuilt = true;
}

function ensureBuiltNativeRuntimeArtifacts() {
  if (packedNativeRuntimeBuilt) return;
  ensureBuiltPackedDist();
  execFileSync("bun", ["scripts/build-runtime-binaries.ts"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      HUSKY: "0",
    },
  });
  execFileSync("bun", ["scripts/stage-plugin-runtime-artifacts.ts"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      HUSKY: "0",
    },
  });
  packedNativeRuntimeBuilt = true;
}

function preparePackageForPack(): void {
  if (existsSync(PREPACK_PACKAGE_BACKUP_PATH)) {
    execFileSync("bun", ["src/build/package-manifest.ts", "restore"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        HUSKY: "0",
      },
    });
  }
  execFileSync("vp", ["run", "stage:workflow-skills"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      HUSKY: "0",
    },
  });
  execFileSync("bun", ["src/build/package-manifest.ts", "prepare"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      HUSKY: "0",
    },
  });
}

function restorePackageAfterPack(): void {
  execFileSync("bun", ["src/build/package-manifest.ts", "restore"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      HUSKY: "0",
    },
  });
}

function ensurePackedTarballArtifact() {
  if (packedTarballArtifactCache) return packedTarballArtifactCache;
  ensureBuiltPackedDist();
  const release = acquirePackLock();
  let raw: string;
  try {
    preparePackageForPack();
    packedTarballTempRoot = mkdtempSync(join(tmpdir(), "wp-packed-artifact-"));
    raw = execFileSync(
      "npm",
      ["pack", "--ignore-scripts", "--json", "--pack-destination", packedTarballTempRoot],
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
        env: {
          ...process.env,
          HUSKY: "0",
        },
      },
    );
  } finally {
    try {
      restorePackageAfterPack();
    } finally {
      release();
    }
  }
  const entries = parseNpmJson<Array<{ filename?: string }>>(raw);
  const tarballName = entries[0]?.filename;
  if (!tarballName) {
    throw new Error("npm pack did not return a tarball filename");
  }
  const tarballPath = join(packedTarballTempRoot ?? REPO_ROOT, tarballName);
  const paths = execFileSync("tar", ["-tf", tarballPath], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^package\//, ""))
    .filter(Boolean);
  const manifest = execFileSync("tar", ["-xOf", tarballPath, "package/package.json"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  packedTarballArtifactCache = {
    ...(JSON.parse(manifest) as Omit<PackedTarballArtifact, "paths" | "tarballPath">),
    tarballPath,
    paths,
  };
  return packedTarballArtifactCache;
}

function readPackedSurfaceMetadata() {
  return ensurePackedTarballArtifact();
}

function listPackedManifestCatalogSpecifiers(pkg: {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}) {
  const sections = [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ] as const;
  return sections.flatMap((section) =>
    Object.entries(pkg[section] ?? {})
      .filter(([, version]) => version.startsWith("catalog:"))
      .map(([name, version]) => `${section}.${name}=${version}`),
  );
}

function createPackedTarball(): { tarballPath: string; cleanup: () => void } {
  const artifact = ensurePackedTarballArtifact();
  return {
    tarballPath: artifact.tarballPath,
    cleanup: () => {},
  };
}

type InstalledPackedConsumerOptions = {
  packageJson: Record<string, unknown>;
  installPackageJson?: Record<string, unknown>;
  tempPrefix: string;
  omitDev?: boolean;
};

type InstalledPackedConsumer = {
  root: string;
  packageRoot: string;
  wpBinPath: string;
  cleanup: () => void;
};

let installedPackedConsumerCache: InstalledPackedConsumer | undefined;

function createInstalledPackedConsumer(
  tarballPath: string,
  options: InstalledPackedConsumerOptions,
): InstalledPackedConsumer {
  const root = mkdtempSync(join(tmpdir(), options.tempPrefix));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify(options.installPackageJson ?? options.packageJson, null, 2) + "\n",
  );
  const installArgs = [
    "install",
    tarballPath,
    "--omit=optional",
    "--no-audit",
    "--fund=false",
    "--package-lock=false",
    "--prefer-offline",
  ];
  if (options.omitDev) {
    installArgs.push("--omit=dev");
  }
  execFileSync("npm", installArgs, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, HUSKY: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (options.installPackageJson) {
    writeFileSync(join(root, "package.json"), JSON.stringify(options.packageJson, null, 2) + "\n");
  }

  return {
    root,
    packageRoot: join(root, "node_modules", "@webpresso", "agent-kit"),
    wpBinPath: join(root, "node_modules", "@webpresso", "agent-kit", "bin", "wp"),
    cleanup: () => {
      rmSync(root, { force: true, recursive: true });
    },
  };
}

function ensureInstalledPackedConsumer(): InstalledPackedConsumer {
  if (installedPackedConsumerCache) return installedPackedConsumerCache;
  const { tarballPath } = createPackedTarball();
  installedPackedConsumerCache = createInstalledPackedConsumer(tarballPath, {
    tempPrefix: "wp-packed-consumer-",
    packageJson: {
      name: "packed-consumer-smoke",
      private: true,
      devDependencies: {
        "@webpresso/agent-config": "^0.1.5",
        vitest: "^2.1.0",
        "@playwright/test": "^1.55.0",
        oxlint: "^1.0.0",
        oxfmt: "^1.0.0",
      },
    },
    installPackageJson: {
      name: "packed-consumer-smoke",
      private: true,
    },
  });
  return installedPackedConsumerCache;
}

function createHostRuntimeTarball(tempRoot: string): { tarballPath: string } {
  ensureBuiltNativeRuntimeArtifacts();
  const target = resolveRuntimeTarget();
  if (!target) {
    throw new Error(`No compiled host runtime target for ${process.platform}/${process.arch}`);
  }
  const packageRoot = join(
    REPO_ROOT,
    "dist",
    "runtime-packages",
    runtimePackageDirName(target.packageName),
  );
  const raw = execFileSync(
    "npm",
    ["pack", "--ignore-scripts", "--json", "--pack-destination", tempRoot],
    {
      cwd: packageRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        HUSKY: "0",
      },
    },
  );
  const entries = parseNpmJson<Array<{ filename?: string }>>(raw);
  const tarballName = entries[0]?.filename;
  if (!tarballName) {
    throw new Error("npm pack did not return a host runtime tarball filename");
  }
  return { tarballPath: join(tempRoot, tarballName) };
}

function unpackTarball(tarballPath: string, destinationRoot: string): string {
  const unpackRoot = join(destinationRoot, "unpacked");
  mkdirSync(unpackRoot, { recursive: true });
  execFileSync("tar", ["-xf", tarballPath, "-C", unpackRoot], {
    encoding: "utf8",
  });
  return join(unpackRoot, "package");
}

afterAll(() => {
  if (packedTarballTempRoot) {
    rmSync(packedTarballTempRoot, { force: true, recursive: true });
    packedTarballTempRoot = undefined;
    packedTarballArtifactCache = undefined;
  }
  if (installedPackedConsumerCache) {
    installedPackedConsumerCache.cleanup();
    installedPackedConsumerCache = undefined;
  }
  if (readFileSync(PACKAGE_JSON_PATH, "utf8") !== ORIGINAL_PACKAGE_JSON_TEXT) {
    // Atomic restore: concurrent bun processes must never see a truncated package.json.
    const tmpPath = `${PACKAGE_JSON_PATH}.writing`;
    writeFileSync(tmpPath, ORIGINAL_PACKAGE_JSON_TEXT);
    renameSync(tmpPath, PACKAGE_JSON_PATH);
  }
});

describe("tooling umbrella package integration contract", () => {
  beforeAll(() => {
    ensurePackedTarballArtifact();
    ensureInstalledPackedConsumer();
  }, 300_000);

  it("packs no banned internal tarball artifacts", () => {
    const packedPaths = readPackedSurfaceMetadata().paths;
    const banned = packedPaths.filter((path) =>
      FORBIDDEN_TARBALL_PATHS.some((pattern) => pattern.test(path)),
    );

    expect(banned).toEqual([]);
    expect(packedPaths).toContain("bin/wp");
    expect(packedPaths).not.toContain("bin/wp.js");
    expect(
      packedPaths.some((path) => path.startsWith(["native", "session-memory-engine"].join("/"))),
    ).toBe(false);
  }, 30_000);

  it("packs a manifest with no workspace-only catalog specifiers", () => {
    const packedManifest = readPackedSurfaceMetadata();

    expect(listPackedManifestCatalogSpecifiers(packedManifest)).toEqual([]);
  }, 30_000);

  it("packs the built blueprint migration SQL assets under dist/esm", () => {
    const packedPaths = readPackedSurfaceMetadata().paths;

    for (const file of EXPECTED_BLUEPRINT_MIGRATION_SQL_FILES) {
      expect(packedPaths).toContain(`dist/esm/blueprint/db/migrations/${file}`);
    }
  }, 30_000);

  it("packed consumers receive runtime-owned setup guidance without losing authoring deps", () => {
    const installedConsumer = ensureInstalledPackedConsumer();
    const fakeHome = join(installedConsumer.root, ".home");
    const fakeCodexHome = join(installedConsumer.root, ".codex-home");

    try {
      execFileSync("git", ["init", "-q"], { cwd: installedConsumer.root, encoding: "utf8" });
      chmodSync(installedConsumer.wpBinPath, 0o755);

      const output = execFileSync(
        installedConsumer.wpBinPath,
        ["setup", "--yes", "--cwd", installedConsumer.root],
        {
          cwd: installedConsumer.root,
          encoding: "utf8",
          env: {
            ...process.env,
            CI: "1",
            CODEX_HOME: fakeCodexHome,
            HOME: fakeHome,
            HUSKY: "0",
            WP_SKIP_CLAUDE_PLUGIN: "1",
            WP_SKIP_RTK: "1",
            WP_SKIP_UPDATE_CHECK: "1",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      expect(output).toContain("Runtime-owned tooling contract:");
      expect(output).toContain("wp now owns execution for test, e2e, lint, format, and typecheck.");
      expect(output).toContain(
        "Keep local authoring deps when imported directly: @changesets/cli, vitest, @playwright/test, typescript",
      );
      expect(output).toContain(
        "Review execution-only deps for removal if they only powered local binaries: oxlint, oxfmt",
      );
      expect(output).toContain(
        "Do not blanket-remove devDependencies just because wp can execute the tool.",
      );
    } finally {
      rmSync(fakeCodexHome, { force: true, recursive: true });
      rmSync(fakeHome, { force: true, recursive: true });
    }
  }, 120_000);

  it("installed packed consumers can execute blueprint DB migrations from the packaged dist asset path", () => {
    const installedConsumer = ensureInstalledPackedConsumer();

    try {
      const smokeOutput = execFileSync(
        "node",
        [
          "--input-type=module",
          "--eval",
          createInstalledBlueprintMigrationSmokeScript({
            packageRoot: installedConsumer.packageRoot,
            expectedSqlFiles: EXPECTED_BLUEPRINT_MIGRATION_SQL_FILES,
            expectedVersions: EXPECTED_BLUEPRINT_SCHEMA_VERSIONS,
          }),
        ],
        {
          cwd: installedConsumer.root,
          encoding: "utf8",
          env: { ...process.env, HUSKY: "0" },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      expect(smokeOutput).toContain('"versions"');
      expect(smokeOutput).toContain('"0001_seed.sql"');
    } finally {
      // Keep the installed consumer fixture cached across package-contract cases.
    }
  }, 120_000);

  it("packed global installs keep bare wp typecheck targeting aligned with the host runtime package", () => {
    const { tarballPath, cleanup } = createPackedTarball();
    const tmpRoot = mkdtempSync(join(tmpdir(), "wp-packed-global-typecheck-"));
    const fakeHome = join(tmpRoot, "home");
    const globalPrefix = join(fakeHome, ".vite-plus");
    const { tarballPath: runtimeTarballPath } = createHostRuntimeTarball(tmpRoot);
    const unpackedRuntimePackageRoot = unpackTarball(runtimeTarballPath, join(tmpRoot, "runtime"));

    try {
      const env = {
        ...process.env,
        HOME: fakeHome,
        HUSKY: "0",
        WP_SKIP_UPDATE_CHECK: "1",
        npm_config_prefix: globalPrefix,
        PATH: [join(globalPrefix, "bin"), globalPrefix, process.env.PATH ?? ""].join(delimiter),
      };
      const workspaceRoot = join(tmpRoot, "typecheck-parity-workspace");

      execFileSync(
        "npm",
        [
          "install",
          "--global",
          runtimeTarballPath,
          "--no-audit",
          "--fund=false",
          "--package-lock=false",
          "--prefer-offline",
        ],
        {
          cwd: tmpRoot,
          encoding: "utf8",
          env,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      execFileSync(
        "npm",
        [
          "install",
          "--global",
          tarballPath,
          "--omit=optional",
          "--force",
          "--no-audit",
          "--fund=false",
          "--package-lock=false",
          "--prefer-offline",
        ],
        {
          cwd: tmpRoot,
          encoding: "utf8",
          env,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      const runtimeProbe = probeRuntimeTypecheckParity({
        command: join(unpackedRuntimePackageRoot, "bin", "wp"),
        env,
        workspaceRoot,
      });
      const probe = probeRuntimeTypecheckParity({
        command: "wp",
        env,
        workspaceRoot,
      });

      expect(runtimeProbe.ok).toBe(true);
      expect(probe.ok).toBe(true);
      expect(probe.helpOutput).toContain("--file");
      expect(probe.helpOutput).toContain("--package");
      expect(probe.fileOutput).toContain("Resolved typecheck scopes: @parity/root, @parity/widget");
      expect(probe.failures).toEqual(runtimeProbe.failures);
      expect(probe.helpOutput).toContain(runtimeProbe.helpOutput.trim());
    } finally {
      cleanup();
      rmSync(tmpRoot, { force: true, recursive: true });
    }
  }, 300_000);
});
