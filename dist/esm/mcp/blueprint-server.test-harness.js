import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { openDb } from "#db/connection.js";
import { ingestBlueprints } from "#db/ingester.js";
import { resolveBlueprintProjectionDbPath } from "#db/paths.js";
import { recordProjectionMetadata } from "#freshness.js";
import { registerBlueprintTools } from "./blueprint-server.js";
export function makeRegistrar() {
    const tools = new Map();
    const registrar = {
        registerTool(name, _desc, _schema, _outSchema, handler) {
            tools.set(name, { name, handler });
        },
    };
    return { registrar, tools };
}
export async function callTool(tools, name, input) {
    const tool = tools.get(name);
    if (!tool)
        throw new Error(`Tool "${name}" not registered`);
    return tool.handler(input);
}
export function parseResult(result) {
    const text = result.content[0];
    if (!text || text.type !== "text" || typeof text.text !== "string") {
        throw new Error("Expected text content block");
    }
    return JSON.parse(text.text);
}
export function createTempBlueprintRepo(prefix = "wp-bs-test-") {
    const dir = mkdtempSync(path.join(tmpdir(), prefix));
    mkdirSync(path.join(dir, ".agent"), { recursive: true });
    mkdirSync(path.join(dir, "blueprints", "draft"), { recursive: true });
    mkdirSync(path.join(dir, "bin"), { recursive: true });
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "test" }), "utf8");
    writeFileSync(path.join(dir, "bin", "wp"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    process.env["WP_BLUEPRINT_TRUST_GATE_TEST_HEAD"] ??= "0123456789abcdef0123456789abcdef01234567";
    return dir;
}
export function trustDossierFixture(evidence = "repo:package.json") {
    return `
## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 0123456789abcdef0123456789abcdef01234567
- trust-gate-version: v1

### Material Claims

| ID | Claim | Evidence |
| -- | ----- | -------- |
| C1 | The blueprint has repository-backed evidence. | ${evidence} |

### Material Decisions

| ID | Decision | Chosen option | Rejected alternatives | Rationale |
| -- | -------- | ------------- | --------------------- | --------- |
| D1 | Promote through the hard planned gate. | Use the Trust Dossier contract. | Promote without evidence. | Draft-to-planned promotion must be auditable. |

### Promotion Gates

| Gate | Command | Expected outcome | Last result |
| ---- | ------- | ---------------- | ----------- |
| lifecycle | wp audit blueprint-lifecycle | pass | pass at 2026-06-22T00:00:00.000Z |

### Residual Unknowns

None.
`;
}
export function approvalFrontmatterFixture() {
    return `approvals:
  - reviewer: codex
    verdict: approve
    evidence: reviews.md
  - reviewer: deepseek
    verdict: approve
    evidence: reviews.md
`;
}
export function withApprovalFrontmatter(content) {
    if (!content.startsWith("---\n")) {
        throw new Error("Blueprint fixture must start with frontmatter fence");
    }
    return content.replace("---\n", `---\n${approvalFrontmatterFixture()}`);
}
export function writeApprovalLedgerFixture(cwd, stateDir, slug) {
    const ledgerPath = path.join(cwd, "blueprints", stateDir, slug, "reviews.md");
    const records = ["codex", "deepseek"].map((reviewer, index) => ({
        id: `2026-06-28T00:00:0${index}.000Z:${reviewer}:fixture`,
        blueprintSlug: `${stateDir}/${slug}`,
        targetKind: "blueprint",
        targetId: `${stateDir}/${slug}`,
        timestamp: `2026-06-28T00:00:0${index}.000Z`,
        reviewer,
        verdict: "approve",
        evidence: "reviews.md",
        source: "structured",
    }));
    const entries = records
        .map((record) => `<!-- wp:review-entry ${JSON.stringify(record)} -->`)
        .join("\n");
    writeFileSync(ledgerPath, `# Review ledger — ${slug}

| Date | Reviewer | Rev | Verdict | Note |
| ---- | -------- | --- | ------- | ---- |

${entries}
`, "utf8");
    if (!existsSync(path.join(cwd, ".git"))) {
        execFileSync("git", ["init", "-q"], { cwd, stdio: "ignore" });
    }
    execFileSync("git", ["add", "--", path.relative(cwd, ledgerPath)], {
        cwd,
        stdio: "ignore",
    });
    return ledgerPath;
}
export function writeBlueprintFixture(cwd, fixture) {
    const overviewPath = path.join(cwd, "blueprints", fixture.stateDir, fixture.slug, "_overview.md");
    mkdirSync(path.dirname(overviewPath), { recursive: true });
    writeFileSync(overviewPath, fixture.content, "utf8");
    return { overviewPath };
}
export async function registerBlueprintToolMap(cwd) {
    const { registrar, tools } = makeRegistrar();
    await registerBlueprintTools(registrar, cwd);
    return tools;
}
export async function makeLazyBlueprintHarness(prefix = "wp-bs-test-") {
    const tmpDir = createTempBlueprintRepo(prefix);
    const tools = await registerBlueprintToolMap(tmpDir);
    return { tmpDir, tools };
}
export function createEmptyBlueprintProjection(cwd) {
    const dbFile = resolveBlueprintProjectionDbPath(cwd);
    mkdirSync(path.dirname(dbFile), { recursive: true });
    const conn = openDb(dbFile);
    try {
        recordProjectionMetadata({ dbPath: dbFile, cwd, ingestedAt: Date.now() });
    }
    finally {
        conn.close();
    }
    return dbFile;
}
export async function makeEmptyProjectionBlueprintHarness(prefix = "wp-bs-empty-projection-") {
    const tmpDir = createTempBlueprintRepo(prefix);
    createEmptyBlueprintProjection(tmpDir);
    const tools = await registerBlueprintToolMap(tmpDir);
    return { tmpDir, tools };
}
export async function makeProjectionBackedBlueprintHarness(prefix, fixtures) {
    const tmpDir = createTempBlueprintRepo(prefix);
    const overviewPaths = fixtures.map((fixture) => writeBlueprintFixture(tmpDir, fixture).overviewPath);
    await bootstrapBlueprintProjection(tmpDir);
    const tools = await registerBlueprintToolMap(tmpDir);
    return { tmpDir, tools, overviewPaths };
}
export async function bootstrapBlueprintProjection(cwd) {
    const dbFile = resolveBlueprintProjectionDbPath(cwd);
    mkdirSync(path.dirname(dbFile), { recursive: true });
    const conn = openDb(dbFile);
    try {
        await ingestBlueprints({ db: conn.db, cwd });
    }
    finally {
        conn.close();
    }
    recordProjectionMetadata({ dbPath: dbFile, cwd, ingestedAt: Date.now() });
    return dbFile;
}
export function cleanupTempDir(dir) {
    if (dir)
        rmSync(dir, { recursive: true, force: true });
}
export function markBlueprintValidated(cwd, slug, timestamp = Date.now() + 10_000) {
    const validateTimestampPath = path.join(cwd, ".agent", ".validate-timestamps.json");
    mkdirSync(path.dirname(validateTimestampPath), { recursive: true });
    writeFileSync(validateTimestampPath, JSON.stringify({ [slug]: timestamp }, null, 2) + "\n", "utf8");
}
export function writeStaleProjectionMetadata(cwd) {
    writeFileSync(`${resolveBlueprintProjectionDbPath(cwd)}.meta.json`, JSON.stringify({ head_at_ingest: "deadbeef".repeat(5), ingested_at: 1 }) + "\n", "utf8");
}
export function makeLocalBlueprintRepo(slug, content = VALID_BLUEPRINT) {
    const dir = createTempBlueprintRepo("wp-bs-local-bp-");
    const { overviewPath } = writeBlueprintFixture(dir, { stateDir: "draft", slug, content });
    return { dir, overviewPath };
}
export const VALID_BLUEPRINT = `---
type: blueprint
title: My Feature Blueprint
status: draft
complexity: M
owner: alice
created: '2026-01-15'
last_updated: '2026-04-01'
---

## Product wedge anchor

- **Stage outcome:** Phase 1 — ship feature X
- **Consuming surface:** /dashboard route
- **New user-visible capability:** Users can see feature X on the dashboard.

## Summary

A well-formed blueprint for testing.

#### Task 1.1: Do the thing

**Status:** todo
**Wave:** 0

**Acceptance:**
- [ ] The thing is done
`;
export const INVALID_BLUEPRINT_MISSING_WEDGE = `---
type: blueprint
title: Bad Blueprint
status: draft
complexity: M
owner: alice
created: '2026-01-15'
last_updated: '2026-04-01'
---

## Summary

This blueprint is missing the product wedge anchor and task acceptance.

#### Task 1.1: Do the thing

**Status:** todo
`;
export const INVALID_BLUEPRINT_NO_TASKS = `---
type: blueprint
title: No Tasks Blueprint
status: draft
complexity: S
owner: bob
created: '2026-01-15'
last_updated: '2026-04-01'
---

## Product wedge anchor

- **Stage outcome:** something
- **Consuming surface:** /somewhere
- **New user-visible capability:** something

## Summary

Blueprint with no task sections at all.
`;
export const INVALID_BLUEPRINT_MISSING_FRONTMATTER = `---
type: blueprint
title: ''
status: draft
complexity: M
---

## Product wedge anchor

- **Stage outcome:** x
- **Consuming surface:** /x
- **New user-visible capability:** x

#### Task 1.1: A task

**Status:** todo

**Acceptance:**
- [ ] something
`;
//# sourceMappingURL=blueprint-server.test-harness.js.map