import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();

const requiredSubpaths = [
  "@webpresso/agent-kit/oxlint",
  "@webpresso/agent-kit/docs-lint",
  "@webpresso/agent-kit/launch",
  "@webpresso/agent-kit/test-preset",
  "@webpresso/agent-kit/e2e-preset",
  "@webpresso/agent-kit/wp-extension",
] as const;

const exportSourceTargets: Record<string, string> = {
  "./oxlint": "./src/config/oxlint/index.ts",
  "./oxlint/import-hygiene": "./src/config/oxlint/import-hygiene.ts",
  "./oxlint/monorepo-paths": "./src/config/oxlint/monorepo-paths.ts",
  "./oxlint/foundation-purity": "./src/config/oxlint/foundation-purity.ts",
  "./oxlint/tier-boundaries": "./src/config/oxlint/tier-boundaries.ts",
  "./oxlint/query-patterns": "./src/config/oxlint/query-patterns.ts",
  "./oxlint/graphql-conventions": "./src/config/oxlint/graphql-conventions.ts",
  "./oxlint/testing-quality": "./src/config/oxlint/testing-quality.ts",
  "./oxlint/code-safety": "./src/config/oxlint/code-safety.ts",
  "./docs-lint": "./src/config/docs-lint/index.ts",
  "./docs-lint/schemas": "./src/config/docs-lint/schemas/index.ts",
  "./docs-lint/generator": "./src/config/docs-lint/generator/index.ts",
  "./launch": "./src/config/launch/index.ts",
  "./test-preset": "./src/config/test-preset/index.ts",
  "./test-preset/vitest": "./src/config/test-preset/vitest.ts",
  "./e2e-preset": "./src/config/e2e-preset/index.ts",
  "./e2e-preset/playwright": "./src/config/e2e-preset/playwright.ts",
  "./wp-extension": "./src/wp-extension/index.ts",
};

const docsLintBins = {
  "docs-check-internal-links": "bin/docs-check-internal-links.js",
  "docs-check-refs": "bin/docs-check-refs.js",
  "docs-check-stale": "bin/docs-check-stale.js",
  "docs-lint": "bin/docs-lint.js",
  "docs-migrate": "bin/docs-migrate.js",
} as const;

type PackageJson = {
  bin?: Record<string, string>;
  exports?: Record<string, unknown>;
  files?: string[];
  tshy?: { exports?: Record<string, string> };
};

async function readCanonicalPackageJson(): Promise<PackageJson> {
  return JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8")) as PackageJson;
}

function exportedDefaultTarget(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return undefined;

  const topLevelDefault = (value as { default?: string }).default;
  if (typeof topLevelDefault === "string") return topLevelDefault;

  const importValue = (value as { import?: unknown }).import;
  if (!importValue || typeof importValue !== "object") return undefined;

  return (importValue as { default?: string }).default;
}

describe("@webpresso/agent-kit package exports", () => {
  it("maps every folded subpath from source exports to public package exports", async () => {
    const packageJson = await readCanonicalPackageJson();

    for (const [subpath, sourceTarget] of Object.entries(exportSourceTargets)) {
      expect(packageJson.tshy?.exports?.[subpath]).toBe(sourceTarget);
      expect(packageJson.exports).toHaveProperty(subpath);
      expect(
        exportedDefaultTarget(packageJson.exports?.[subpath]) ?? packageJson.exports?.[subpath],
      ).toBeDefined();
    }

    expect(packageJson.files).not.toContain("src");
    expect(packageJson.files).not.toContain("docs");
    expect(packageJson.files).toContain("dist/esm");
    expect(packageJson.files).toContain("!dist/**/*.map");
    expect(packageJson.files).toContain("bin/wp");
    expect(packageJson.files).toContain("bin/*.js");
  });

  it("no longer exposes tsconfig subpaths — moved to @webpresso/agent-config", async () => {
    const packageJson = await readCanonicalPackageJson();
    for (const subpath of [
      "./tsconfig/base.json",
      "./tsconfig/cloudflare.json",
      "./tsconfig/library.json",
      "./tsconfig/react-library.json",
      "./tsconfig/react-router.json",
    ] as const) {
      expect(packageJson.exports).not.toHaveProperty(subpath);
    }
  });

  it("hard-cuts branded preset exports from the package contract", async () => {
    const packageJson = await readCanonicalPackageJson();

    expect(packageJson.exports?.["./tsconfig/webpresso.json"]).toBeUndefined();
    expect(packageJson.exports?.["./tsconfig/webpresso"]).toBeUndefined();
    expect(packageJson.exports?.["./vitest/webpresso/node"]).toBeUndefined();
    expect(packageJson.exports?.["./vitest/webpresso/react"]).toBeUndefined();
    expect(packageJson.exports?.["./vitest/webpresso/react-router"]).toBeUndefined();
    expect(packageJson.exports?.["./vitest/webpresso/workers"]).toBeUndefined();
    expect(packageJson.exports?.["./stryker/webpresso"]).toBeUndefined();
  });

  it("exports the local agent bundle prep surface", async () => {
    const packageJson = await readCanonicalPackageJson();

    expect(packageJson.tshy?.exports?.["./bundle"]).toBe("./src/cli/bundle/index.ts");
    expect(packageJson.exports?.["./bundle"]).toBeDefined();
  });

  it("keeps the public wp entrypoints and wires folded docs-lint bins to local entrypoints", async () => {
    const packageJson = await readCanonicalPackageJson();

    expect(packageJson.bin).toMatchObject({
      wp: "bin/wp",
      ...docsLintBins,
    });
  });

  it("resolves key public subpaths through the canonical @webpresso/agent-kit package manifest", async () => {
    const packageJson = await readCanonicalPackageJson();
    const tempDir = await mkdtemp(join(tmpdir(), "agent-kit-export-resolution-"));
    const packageDir = join(tempDir, "node_modules", "@webpresso", "agent-kit");

    await mkdir(packageDir, { recursive: true });
    await writeFile(join(packageDir, "package.json"), JSON.stringify(packageJson), "utf8");

    try {
      const output = execFileSync(
        "node",
        [
          "--input-type=module",
          "--eval",
          `for (const specifier of ${JSON.stringify(requiredSubpaths)}) console.log(specifier + ' => ' + import.meta.resolve(specifier))`,
        ],
        { cwd: tempDir, encoding: "utf8" },
      );

      for (const subpath of requiredSubpaths) {
        expect(output).toContain(`${subpath} => file://`);
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("keeps folded docs-lint bins in the canonical webpresso package manifest", async () => {
    const packageJson = await readCanonicalPackageJson();

    expect(packageJson.bin).toMatchObject(docsLintBins);
  });

  it("maps blueprint #module.js imports without doubling the .js extension", async () => {
    const packageJson = await readCanonicalPackageJson();
    const imports = packageJson.imports as Record<string, string> | undefined;

    expect(imports?.["#*.js"]).toBe("./src/blueprint/*.ts");

    const distPackageJsonPath = join(repositoryRoot, "dist/esm/package.json");
    let distPackageJson: { imports?: Record<string, string> };
    try {
      distPackageJson = JSON.parse(await readFile(distPackageJsonPath, "utf8")) as {
        imports?: Record<string, string>;
      };
    } catch {
      return;
    }

    expect(distPackageJson.imports?.["#*.js"]).toBe("./blueprint/*.js");

    await import(join(repositoryRoot, "dist/esm/blueprint/db/cold-start.js"));
  });
});
