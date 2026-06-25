export function createInstalledBlueprintMigrationSmokeScript(options: {
  packageRoot: string;
  expectedSqlFiles: readonly string[];
  expectedVersions: readonly number[];
}): string {
  return `
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const packageRoot = ${JSON.stringify(options.packageRoot)};
const expectedSqlFiles = ${JSON.stringify([...options.expectedSqlFiles])};
const expectedVersions = ${JSON.stringify([...options.expectedVersions])};
const migrationsDir = join(packageRoot, 'dist', 'esm', 'blueprint', 'db', 'migrations');
const sqlFiles = readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort();
for (const file of expectedSqlFiles) {
  if (!sqlFiles.includes(file)) {
    throw new Error(\`Missing packaged migration SQL file \${file} in \${migrationsDir}\`);
  }
}

const { openDb } = await import(pathToFileURL(join(packageRoot, 'dist', 'esm', 'blueprint', 'db', 'connection.js')).href);
const scratchRoot = mkdtempSync(join(tmpdir(), 'wp-packed-blueprint-db-'));
const dbPath = join(scratchRoot, 'packed.db');
const conn = openDb(dbPath);

try {
  const versions = conn.db
    .prepare('SELECT version FROM schema_version ORDER BY version')
    .all()
    .map((row) => row.version);
  if (JSON.stringify(versions) !== JSON.stringify(expectedVersions)) {
    throw new Error(\`Unexpected schema versions: \${JSON.stringify(versions)}\`);
  }
  console.log(JSON.stringify({ sqlFiles, versions }));
} finally {
  conn.close();
  rmSync(scratchRoot, { recursive: true, force: true });
}
`.trim();
}
