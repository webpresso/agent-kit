import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface OutdatedEntry {
  readonly current?: string;
  readonly wanted?: string;
  readonly latest?: string;
  readonly dependencyType?: string;
  readonly dependentPackages?: readonly { readonly name?: string; readonly location?: string }[];
}

interface DependencyException {
  readonly package?: unknown;
  readonly reason?: unknown;
  readonly owner?: unknown;
  readonly expiry?: unknown;
  readonly linkedIssue?: unknown;
}

interface FreshnessFailure {
  readonly message: string;
}

function parseArgs(args: readonly string[]): Map<string, string> {
  const parsed = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg?.startsWith("--")) continue;
    const [key, inlineValue] = arg.split("=", 2);
    if (inlineValue !== undefined) {
      parsed.set(key, inlineValue);
      continue;
    }
    const next = args[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      parsed.set(key, next);
      index += 1;
    } else {
      parsed.set(key, "true");
    }
  }
  return parsed;
}

function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function runText(command: string, args: readonly string[], cwd: string): string {
  return execFileSync(command, [...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function extractJsonPayloadAt(trimmed: string, start: number): string | null {
  const opening = trimmed[start];
  if (opening !== "{" && opening !== "[") return null;
  const closing = opening === "{" ? "}" : "]";
  const stack = [closing];
  let inString = false;
  let escaped = false;

  for (let index = start + 1; index < trimmed.length; index += 1) {
    const char = trimmed[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{" || char === "[") {
      stack.push(char === "{" ? "}" : "]");
      continue;
    }

    if (char === "}" || char === "]") {
      const expected = stack.pop();
      if (char !== expected) return null;
      if (stack.length === 0) return trimmed.slice(start, index + 1);
    }
  }

  return null;
}

function parsePnpmOutdatedOutput(output: string): Record<string, OutdatedEntry> {
  const trimmed = output.trim();
  for (let index = 0; index < trimmed.length; index += 1) {
    const payload = extractJsonPayloadAt(trimmed, index);
    if (!payload) continue;
    try {
      return JSON.parse(payload) as Record<string, OutdatedEntry>;
    } catch {
      // Keep scanning: pnpm may prefix JSON with bracketed warnings such as [WARN].
    }
  }

  const preview = trimmed.slice(0, 240);
  throw new Error(
    `pnpm outdated did not emit parseable JSON${preview ? `; stdout began: ${preview}` : ""}`,
  );
}

function loadOutdatedJson(root: string, args: Map<string, string>): Record<string, OutdatedEntry> {
  const fixturePath = args.get("--outdated-json") ?? process.env.WP_DEPS_FRESHNESS_OUTDATED_JSON;
  if (fixturePath) return readJsonFile(resolve(root, fixturePath)) as Record<string, OutdatedEntry>;
  const result = spawnSync("pnpm", ["outdated", "-r", "--format", "json"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = (result.stdout ?? "").trim();
  if (!output && result.status && result.status !== 0) {
    throw new Error((result.stderr ?? "pnpm outdated failed").trim());
  }
  return output ? parsePnpmOutdatedOutput(output) : {};
}

function latestPnpmVersion(root: string, args: Map<string, string>): string {
  const fixture = args.get("--pnpm-latest") ?? process.env.WP_DEPS_FRESHNESS_PNPM_LATEST;
  if (fixture) return fixture;
  return runText("npm", ["view", "pnpm", "version"], root).trim();
}

function normalizeVersion(value: string | undefined): string {
  return (value ?? "").trim();
}

function compareVersionText(left: string | undefined, right: string | undefined): boolean {
  return normalizeVersion(left) === normalizeVersion(right);
}

function packageManagerVersion(packageManager: unknown): string | null {
  if (typeof packageManager !== "string") return null;
  const match = /^pnpm@(.+)$/u.exec(packageManager.trim());
  return match?.[1] ?? null;
}

function exceptionList(manifest: Record<string, unknown>): DependencyException[] {
  const topLevel = manifest.dependencyFreshnessExceptions;
  const webpresso = manifest.webpresso;
  const nested =
    webpresso && typeof webpresso === "object" && !Array.isArray(webpresso)
      ? (webpresso as Record<string, unknown>).dependencyFreshnessExceptions
      : undefined;
  return [topLevel, nested].flatMap((value) => (Array.isArray(value) ? value : []));
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function exceptionValidationFailures(
  exceptions: readonly DependencyException[],
  today: Date,
): FreshnessFailure[] {
  const failures: FreshnessFailure[] = [];
  const requiredFields = ["package", "reason", "owner", "expiry", "linkedIssue"] as const;
  for (const [index, entry] of exceptions.entries()) {
    for (const field of requiredFields) {
      if (!stringField(entry[field])) {
        failures.push({ message: `dependencyFreshnessExceptions[${index}] is missing ${field}` });
      }
    }
    const expiry = stringField(entry.expiry);
    if (expiry && Number.isNaN(Date.parse(`${expiry}T00:00:00.000Z`))) {
      failures.push({
        message: `dependencyFreshnessExceptions[${index}] has invalid expiry ${expiry}`,
      });
      continue;
    }
    if (expiry) {
      const expiryTime = Date.parse(`${expiry}T23:59:59.999Z`);
      if (expiryTime < today.getTime()) {
        failures.push({
          message: `dependencyFreshnessExceptions[${index}] for ${String(entry.package)} expired on ${expiry}`,
        });
      }
    }
  }
  return failures;
}

function validExceptionPackages(
  exceptions: readonly DependencyException[],
  today: Date,
): Set<string> {
  const valid = new Set<string>();
  for (const entry of exceptions) {
    const packageName = stringField(entry.package);
    if (!packageName) continue;
    if (!stringField(entry.reason) || !stringField(entry.owner) || !stringField(entry.linkedIssue))
      continue;
    const expiry = stringField(entry.expiry);
    const expiryTime = expiry ? Date.parse(`${expiry}T23:59:59.999Z`) : Number.NaN;
    if (!expiry || Number.isNaN(expiryTime) || expiryTime < today.getTime()) continue;
    valid.add(packageName);
  }
  return valid;
}

function describeDependentPackages(entry: OutdatedEntry): string {
  const packages = entry.dependentPackages ?? [];
  if (packages.length === 0) return "unknown workspace";
  return packages.map((pkg) => pkg.name ?? pkg.location ?? "unknown workspace").join(", ");
}

function dependencyDriftFailures(
  outdated: Record<string, OutdatedEntry>,
  exceptions: ReadonlySet<string>,
): FreshnessFailure[] {
  const failures: FreshnessFailure[] = [];
  for (const [name, entry] of Object.entries(outdated).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (compareVersionText(entry.wanted, entry.latest)) continue;
    if (exceptions.has(name)) continue;
    failures.push({
      message: `${name} is behind latest: wanted ${entry.wanted ?? "unknown"}, latest ${entry.latest ?? "unknown"} (${entry.dependencyType ?? "dependency"}; ${describeDependentPackages(entry)})`,
    });
  }
  return failures;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const root = resolve(args.get("--root") ?? process.cwd());
  const today = new Date(process.env.WP_DEPS_FRESHNESS_TODAY ?? new Date().toISOString());
  const manifest = readJsonFile(resolve(root, "package.json")) as Record<string, unknown>;
  const exceptions = exceptionList(manifest);
  const failures: FreshnessFailure[] = [];

  failures.push(...exceptionValidationFailures(exceptions, today));
  failures.push(
    ...dependencyDriftFailures(
      loadOutdatedJson(root, args),
      validExceptionPackages(exceptions, today),
    ),
  );

  const declaredPnpm = packageManagerVersion(manifest.packageManager);
  const latestPnpm = latestPnpmVersion(root, args);
  if (!declaredPnpm) {
    failures.push({ message: 'package.json#packageManager must be declared as "pnpm@<version>"' });
  } else if (declaredPnpm !== latestPnpm) {
    failures.push({
      message: `package.json#packageManager is behind latest: pnpm@${declaredPnpm}, latest pnpm@${latestPnpm}`,
    });
  }

  if (failures.length > 0) {
    process.stderr.write("Dependency freshness check failed:\n");
    for (const failure of failures) process.stderr.write(`- ${failure.message}\n`);
    process.exit(1);
  }

  process.stdout.write("OK: declared dependencies and packageManager are current\n");
}

main();
