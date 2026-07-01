import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type ExportEntry =
  | string
  | {
      import?: string | { default?: string; types?: string };
      default?: string;
    };

interface PackageManifest {
  exports?: Record<string, ExportEntry>;
}

const TSCONFIG_EXPORT_PREFIX = "./tsconfig/";

function normalizeTsconfigJsonExports(manifest: PackageManifest): PackageManifest {
  if (!manifest.exports) return manifest;

  let changed = false;
  const normalizedExports: Record<string, ExportEntry> = { ...manifest.exports };

  for (const [subpath, entry] of Object.entries(manifest.exports)) {
    if (!subpath.startsWith(TSCONFIG_EXPORT_PREFIX) || !subpath.endsWith(".json")) continue;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;

    const importDefault =
      typeof entry.import === "string"
        ? entry.import
        : entry.import && typeof entry.import === "object"
          ? entry.import.default
          : undefined;

    const nextDefault = typeof entry.default === "string" ? entry.default : importDefault;
    if (typeof nextDefault !== "string") continue;

    const nextImport =
      typeof entry.import === "string"
        ? entry.import
        : entry.import && typeof entry.import === "object"
          ? entry.import.default
            ? { default: entry.import.default }
            : undefined
          : undefined;

    const nextEntry = {
      ...entry,
      ...(nextImport === undefined ? {} : { import: nextImport }),
      default: nextDefault,
    } satisfies Exclude<ExportEntry, string>;

    if (JSON.stringify(nextEntry) === JSON.stringify(entry)) continue;

    normalizedExports[subpath] = nextEntry;
    changed = true;
  }

  return changed ? { ...manifest, exports: normalizedExports } : manifest;
}

function atomicWriteFile(destPath: string, content: string): void {
  const tmpPath = `${destPath}.writing`;
  writeFileSync(tmpPath, content, "utf8");
  renameSync(tmpPath, destPath);
}

const packageJsonPath = join(process.cwd(), "package.json");
const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8")) as PackageManifest;
const normalized = normalizeTsconfigJsonExports(manifest);
if (normalized !== manifest) {
  atomicWriteFile(packageJsonPath, `${JSON.stringify(normalized, null, 2)}\n`);
}
