import type { CAC } from "cac";

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { z } from "zod";

import { flattenAgentDir, writeFlattenedAssets } from "#compiler/flatten";

const PINNED_RULESYNC_VERSION = "9.0.1";
const DEFAULT_TARGETS = "claude,codex,cursor,opencode";
const COMPILE_MANIFEST_VERSION = 1;

// Resolve rulesync bin — checks consumer's node_modules first,
// then falls back to webpresso's own bundled rulesync.
const _require = createRequire(import.meta.url);
function resolveRulesyncBinFromAgentKit(): string | null {
  try {
    const pkgPath = _require.resolve("rulesync/package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
    const binField = pkg.bin;
    const rel =
      typeof binField === "string"
        ? binField
        : typeof binField === "object" && binField !== null && "rulesync" in binField
          ? String((binField as Record<string, string>)["rulesync"])
          : null;
    if (!rel) return null;
    return join(dirname(pkgPath), rel);
  } catch {
    return null;
  }
}

export interface CompileResult {
  readonly ok: boolean;
  readonly targets: readonly string[];
  readonly noOp: boolean;
  readonly message: string;
}

export interface CompileManifest {
  readonly version: number;
  readonly timestamp: string;
  readonly sourceHash: string;
  readonly outputHashes: Readonly<Record<string, string>>;
}

const CompileManifestSchema = z.object({
  version: z.number(),
  timestamp: z.string(),
  sourceHash: z.string(),
  outputHashes: z.record(z.string(), z.string()),
});

function resolveRulesyncBin(cwd: string): string | null {
  // Prefer consumer-local install (supports overrides), fall back to webpresso's bundled copy.
  const consumerBin = join(cwd, "node_modules", ".bin", "rulesync");
  if (existsSync(consumerBin)) return consumerBin;
  return resolveRulesyncBinFromAgentKit();
}

function readRulesyncVersion(cwd: string): string | null {
  const pkgPath = join(cwd, "node_modules", "rulesync", "package.json");
  if (!existsSync(pkgPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
    return typeof parsed.version === "string" ? parsed.version : null;
  } catch {
    return null;
  }
}

function contentHash(assets: {
  skills: Readonly<Record<string, string>>;
  commands: Readonly<Record<string, string>>;
  agents: Readonly<Record<string, string>>;
}): string {
  const entries = [
    ...Object.entries(assets.skills).map(([k, v]) => `s:${k}:${v}`),
    ...Object.entries(assets.commands).map(([k, v]) => `c:${k}:${v}`),
    ...Object.entries(assets.agents).map(([k, v]) => `a:${k}:${v}`),
  ];
  entries.sort();
  return entries.join("\0");
}

function readHashFile(p: string): string | null {
  if (!existsSync(p)) return null;
  try {
    return readFileSync(p, "utf-8").trim();
  } catch {
    return null;
  }
}

/** SHA-256 hash of all .md files under agentDir, recursively (content only). */
export function hashAgentDir(agentDir: string): string {
  const h = createHash("sha256");
  const collected: string[] = [];

  function walk(dir: string): void {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        collected.push(full);
      }
    }
  }

  walk(agentDir);

  for (const filePath of collected) {
    try {
      h.update(readFileSync(filePath));
    } catch {
      /* skip unreadable files */
    }
  }

  return h.digest("hex");
}

/** SHA-256 hash of a single file. Returns empty string if file is missing. */
function hashFile(filePath: string): string {
  if (!existsSync(filePath)) return "";
  try {
    return createHash("sha256").update(readFileSync(filePath)).digest("hex");
  } catch {
    return "";
  }
}

function readCompileManifest(manifestPath: string): CompileManifest | null {
  if (!existsSync(manifestPath)) return null;
  try {
    return CompileManifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf-8")));
  } catch {
    return null;
  }
}

function writeCompileManifest(manifestPath: string, manifest: CompileManifest): void {
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

export async function runCompile(options: {
  cwd: string;
  targets: string;
}): Promise<CompileResult> {
  const { cwd, targets } = options;
  const targetList = targets
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const agentDir = join(cwd, ".agent");
  const lockPath = join(agentDir, ".compile.lock");
  const hashPath = join(agentDir, ".compile.hash");
  const manifestPath = join(agentDir, ".compile-manifest.json");
  const rulesyncBin = resolveRulesyncBin(cwd);

  if (!rulesyncBin || !existsSync(rulesyncBin)) {
    return {
      ok: false,
      targets: targetList,
      noOp: false,
      message: "rulesync is not installed — run `pnpm add rulesync@9.0.1`",
    };
  }

  const installedVersion = readRulesyncVersion(cwd);
  if (installedVersion !== null && installedVersion !== PINNED_RULESYNC_VERSION) {
    process.stderr.write(
      `wp compile: warning — installed rulesync@${installedVersion} does not match pinned @${PINNED_RULESYNC_VERSION}\n`,
    );
  }

  // Atomic lock via O_EXCL — fails if another compile is running
  try {
    writeFileSync(lockPath, String(process.pid), { flag: "ax" });
  } catch {
    return {
      ok: false,
      targets: targetList,
      noOp: false,
      message: `wp compile: lock file exists at ${lockPath} — another compile is running`,
    };
  }

  const cleanup = (): void => {
    try {
      if (existsSync(lockPath)) unlinkSync(lockPath);
    } catch {
      /* best-effort */
    }
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });

  try {
    const assets = flattenAgentDir(agentDir);
    const hash = contentHash(assets);
    const sourceHash = hashAgentDir(agentDir);

    // Check compile manifest for idempotent no-op
    const existingManifest = readCompileManifest(manifestPath);
    if (existingManifest !== null && existingManifest.sourceHash === sourceHash) {
      return {
        ok: true,
        targets: targetList,
        noOp: true,
        message: "No changes (manifest matches)",
      };
    }

    // Legacy hash file check (pre-manifest path)
    if (existingManifest === null && readHashFile(hashPath) === hash) {
      return {
        ok: true,
        targets: targetList,
        noOp: true,
        message: "wp compile: no-op (content unchanged)",
      };
    }

    // Step 1+2: Write flattened assets to tmpdir then atomically rename to .rulesync/
    const tmpOut = mkdtempSync(join(tmpdir(), "wp-compile-"));
    try {
      await writeFlattenedAssets(assets, tmpOut);
      const rulesyncInputDir = join(cwd, ".rulesync");
      if (existsSync(rulesyncInputDir)) rmSync(rulesyncInputDir, { recursive: true, force: true });
      renameSync(tmpOut, rulesyncInputDir);
    } catch (err) {
      rmSync(tmpOut, { recursive: true, force: true });
      throw err;
    }

    // Step 3: Run rulesync generate
    const result = spawnSync(rulesyncBin, ["generate", "--targets", targets], {
      cwd,
      stdio: "inherit",
    });
    if (result.error) {
      return {
        ok: false,
        targets: targetList,
        noOp: false,
        message: `wp compile: rulesync failed to start — ${result.error.message}`,
      };
    }
    const exitCode = result.status ?? 1;
    if (exitCode !== 0) {
      return {
        ok: false,
        targets: targetList,
        noOp: false,
        message: `wp compile: rulesync exited with code ${exitCode}`,
      };
    }

    // Step 4: Emit plugin manifests in parallel
    const skillNames = Object.keys(assets.skills);
    const commandNames = Object.keys(assets.commands);
    const pkgVersion = readPackageVersion(cwd);
    const manifestOpts = {
      agentDir,
      outDir: cwd,
      version: pkgVersion,
      skills: skillNames,
      commands: commandNames,
    };
    await Promise.all([
      import("#compiler/manifests/claude").then((m) => m.emitManifest(manifestOpts)),
      import("#compiler/manifests/codex").then((m) => m.emitManifest(manifestOpts)),
      import("#compiler/manifests/cursor").then((m) => m.emitManifest(manifestOpts)),
    ]);

    // Step 5: Run mergeAgentsMd to produce AGENTS.md at repo root
    const agentsLayers = collectAgentsLayers(agentDir);
    if (agentsLayers.length > 0) {
      const { mergeAgentsMd } = await import("#compiler/memory/merger");
      const mergeResult = await mergeAgentsMd({
        layers: agentsLayers,
        outPath: join(cwd, "AGENTS.md"),
        cwd,
      });
      if (!mergeResult.content) {
        process.stderr.write("wp compile: warning — mergeAgentsMd produced empty content\n");
      } else {
        writeFileSync(join(cwd, "AGENTS.md"), mergeResult.content);
      }
    }

    // Step 6: Write .compile-manifest.json with content-hash sentinels
    const outputHashes: Record<string, string> = {
      "AGENTS.md": hashFile(join(cwd, "AGENTS.md")),
      ".claude-plugin/plugin.json": hashFile(join(cwd, ".claude-plugin", "plugin.json")),
      ".codex-plugin/plugin.json": hashFile(join(cwd, ".codex-plugin", "plugin.json")),
      ".cursor-plugin/plugin.json": hashFile(join(cwd, ".cursor-plugin", "plugin.json")),
    };
    const compileManifest: CompileManifest = {
      version: COMPILE_MANIFEST_VERSION,
      timestamp: new Date().toISOString(),
      sourceHash,
      outputHashes,
    };
    writeCompileManifest(manifestPath, compileManifest);

    writeFileSync(hashPath, hash);
    return {
      ok: true,
      targets: targetList,
      noOp: false,
      message: `wp compile: generated for targets [${targetList.join(", ")}]`,
    };
  } finally {
    cleanup();
  }
}

function readPackageVersion(cwd: string): string {
  const pkgPath = join(cwd, "package.json");
  if (!existsSync(pkgPath)) return "0.0.0";
  try {
    const parsed = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
    return typeof parsed.version === "string" ? parsed.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function collectAgentsLayers(agentDir: string): string[] {
  const agentsDir = join(agentDir, "agents");
  if (!existsSync(agentsDir)) return [];
  try {
    return readdirSync(agentsDir)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .map((f) => join(agentsDir, f));
  } catch {
    return [];
  }
}

export function registerCompileCommand(cli: CAC): void {
  cli
    .command("compile", "Compile .agent/ assets and run rulesync generate for target IDEs")
    .option("--targets <list>", `Comma-separated list of IDE targets (default: ${DEFAULT_TARGETS})`)
    .action(async (options: Record<string, unknown>) => {
      const targets = typeof options.targets === "string" ? options.targets : DEFAULT_TARGETS;
      const result = await runCompile({ cwd: resolve(process.cwd()), targets });
      if (!result.ok) {
        console.error(result.message);
        return 1;
      }
      console.log(result.message);
      return 0;
    });
}
