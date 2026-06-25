import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { registerDoctorCommand, runDoctor } from "./doctor.js";

function tempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "wp-doctor-"));
  mkdirSync(join(dir, ".git"), { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "demo", private: true }));
  return dir;
}

function buildFakeCli() {
  let registeredAction:
    | ((options: { root?: string; docsRoot?: string; fix?: boolean }) => Promise<number>)
    | undefined;

  // Flexible chainable stub: `.option()` is chainable any number of times and
  // `.action()` is always available — not coupled to the exact option count.
  const chain = {
    option: (_flag: string, _desc: string) => chain,
    action: (fn: typeof registeredAction) => {
      registeredAction = fn;
    },
  };

  const cli = {
    command: (_name: string, _desc: string) => chain,
    getAction: () => registeredAction,
  };

  return cli;
}

describe("runDoctor", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 0 on a clean minimal repo", async () => {
    const repo = tempRepo();
    try {
      const logs: string[] = [];
      vi.spyOn(console, "log").mockImplementation((msg?: unknown) => {
        logs.push(String(msg ?? ""));
      });

      const code = await runDoctor({ root: repo });

      expect(code).toBe(0);
      expect(logs.join("\n")).toContain("Catalog drift — single package (no workspace file): OK");
      expect(logs.join("\n")).toContain(
        "Hook/plugin health remains separate: run `wp hooks doctor`.",
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("returns 1 and prints remediation for missing docs frontmatter", async () => {
    const repo = tempRepo();
    mkdirSync(join(repo, "docs"), { recursive: true });
    writeFileSync(join(repo, "docs", "guide.md"), "# hello\n");
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((msg?: unknown) => {
      logs.push(String(msg ?? ""));
    });

    const code = await runDoctor({ root: repo });

    expect(code).toBe(1);
    expect(logs.join("\n")).toContain("Docs frontmatter: FAILED");
    expect(logs.join("\n")).toContain("→ remediation: wp audit docs-frontmatter --fix");
    rmSync(repo, { recursive: true, force: true });
  });

  it("returns repo to clean when --fix is used for docs frontmatter", async () => {
    const repo = tempRepo();
    mkdirSync(join(repo, "docs"), { recursive: true });
    const doc = join(repo, "docs", "guide.md");
    writeFileSync(doc, "# hello\n");

    const code = await runDoctor({ root: repo, fix: true });

    expect(code).toBe(0);
    expect(readFileSync(doc, "utf8")).toContain("last_updated:");
    rmSync(repo, { recursive: true, force: true });
  });
});

describe("registerDoctorCommand", () => {
  it("returns the exit code from runDoctor for an explicit repo root", async () => {
    const repo = tempRepo();
    const cli = buildFakeCli();
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((msg?: unknown) => {
      logs.push(String(msg ?? ""));
    });

    try {
      registerDoctorCommand(cli as never);
      const action = cli.getAction();
      expect(action).toBeDefined();

      const code = await action!({ root: repo });

      expect(code).toBe(0);
      expect(logs.join("\n")).toContain("Catalog drift — single package (no workspace file): OK");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
