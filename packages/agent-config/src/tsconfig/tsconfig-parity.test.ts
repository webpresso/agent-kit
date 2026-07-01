import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const TSCONFIG_DIR = import.meta.dirname;

const configFiles = [
  "base.json",
  "cloudflare.json",
  "library.json",
  "react-library.json",
  "react-router.json",
] as const;

describe("bundled tsconfig JSON files", () => {
  it.each(configFiles)("%s remains bundled and valid JSON", async (fileName) => {
    const target = await readFile(join(TSCONFIG_DIR, fileName));

    expect(() => JSON.parse(target.toString("utf8"))).not.toThrow();
  });

  it("exposes tsconfig JSON subpaths with TypeScript-compatible defaults", async () => {
    const packageJsonPath = resolve(TSCONFIG_DIR, "../../package.json");
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
      exports?: Record<string, unknown>;
    };

    for (const fileName of configFiles) {
      const subpath = `./tsconfig/${fileName}`;
      expect(packageJson.exports?.[subpath]).toEqual({
        import: { default: `./dist/esm/tsconfig/${fileName}` },
        default: `./dist/esm/tsconfig/${fileName}`,
      });
    }
  });

  it("react-library preset owns the React ambient types it requires", async () => {
    const target = await readFile(join(TSCONFIG_DIR, "react-library.json"));
    const parsed = JSON.parse(target.toString("utf8")) as {
      compilerOptions?: { types?: string[] };
    };

    expect(parsed.compilerOptions?.types).toEqual(["react", "react-dom"]);
  });

  it("publishes tsconfig preset inheritance through canonical package subpaths only", async () => {
    const library = JSON.parse(await readFile(join(TSCONFIG_DIR, "library.json"), "utf8")) as {
      extends?: string;
    };
    const reactLibrary = JSON.parse(
      await readFile(join(TSCONFIG_DIR, "react-library.json"), "utf8"),
    ) as { extends?: string };
    const cloudflare = JSON.parse(
      await readFile(join(TSCONFIG_DIR, "cloudflare.json"), "utf8"),
    ) as {
      extends?: string;
    };
    const reactRouter = JSON.parse(
      await readFile(join(TSCONFIG_DIR, "react-router.json"), "utf8"),
    ) as { extends?: string };

    expect(library.extends).toBe("@webpresso/agent-config/tsconfig/base.json");
    expect(reactLibrary.extends).toBe("@webpresso/agent-config/tsconfig/library.json");
    expect(cloudflare.extends).toBe("@webpresso/agent-config/tsconfig/base.json");
    expect(reactRouter.extends).toBe("@webpresso/agent-config/tsconfig/react-library.json");
  });
});
