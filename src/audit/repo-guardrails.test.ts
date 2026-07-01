import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { RepoAuditViolation } from "./repo-guardrails.js";

import {
  auditBlueprintLifecycle,
  auditCatalogDrift,
  auditDocsFrontmatter,
  auditNoLinkProtocol,
  auditNoRelativePackageScripts,
  auditNoRelativeParentImports,
  auditTestIsolation,
  formatRepoAuditReport,
  validateCommitMessage,
} from "./repo-guardrails.js";

function tempRepo() {
  return mkdtempSync(join(tmpdir(), "webpresso-repo-audit-"));
}

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

describe("repo guardrail audits", () => {
  test("catalog drift finds repeated explicit dependency versions across glob and exact workspaces", () => {
    const root = tempRepo();
    mkdirSync(join(root, "packages", "api"), { recursive: true });
    mkdirSync(join(root, "packages", "ui"), { recursive: true });
    mkdirSync(join(root, "infra"), { recursive: true });
    writeFileSync(
      join(root, "pnpm-workspace.yaml"),
      [
        "packages:",
        "  - packages/*",
        "  - infra",
        "catalog:",
        "  react: ^19.0.0",
        "  zod: ^4.0.0",
        "",
      ].join("\n"),
    );
    writeJson(join(root, "packages", "api", "package.json"), {
      name: "@repo/api",
      dependencies: {
        webpresso: "file:/Users/example/webpresso-typescript-config-0.1.0.tgz",
        react: "^19.0.0",
        zod: "workspace:*",
      },
    });
    writeJson(join(root, "packages", "ui", "package.json"), {
      name: "@repo/ui",
      dependencies: {
        webpresso: "file:/Users/example/webpresso-typescript-config-0.1.0.tgz",
        react: "catalog:",
        zod: "workspace:*",
      },
      peerDependencies: { react: ">=19" },
    });
    writeJson(join(root, "infra", "package.json"), {
      name: "@repo/infra",
      devDependencies: { react: "^19.0.0" },
    });

    const result = auditCatalogDrift(root);

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: "packages/api/package.json",
          message: expect.stringContaining("react"),
        }),
        expect.objectContaining({
          file: "infra/package.json",
          message: expect.stringContaining("react"),
        }),
      ]),
    );
    expect(
      result.violations.some((violation: RepoAuditViolation) => violation.message.includes("zod")),
    ).toBe(false);
    expect(
      result.violations.some((violation: RepoAuditViolation) =>
        violation.message.includes("file:"),
      ),
    ).toBe(false);
    expect(
      result.violations.some((violation: RepoAuditViolation) => violation.message.includes(">=19")),
    ).toBe(false);
  });

  test("commit message audit keeps conventional commits loose but enforces lore trailers when requested by subject", () => {
    expect(
      validateCommitMessage(
        [
          "feat(webpresso): share repo audits [lore]",
          "",
          "Move repeated repo validation into Agent Kit.",
          "",
          "Confidence: high",
          "Directive: Keep repo-specific policy in options instead of hard-coding consumers",
          "",
        ].join("\n"),
      ).ok,
    ).toBe(true);

    const result = validateCommitMessage(
      [
        "feat(webpresso): share repo audits [lore]",
        "",
        "Move repeated repo validation into Agent Kit.",
        "",
        "Directive: Keep repo-specific policy in options instead of hard-coding consumers",
        "",
      ].join("\n"),
    );

    expect(result.ok).toBe(false);
    expect(formatRepoAuditReport(result)).toContain("Confidence:");
  });

  test("docs frontmatter audit validates required metadata and folder type contracts", () => {
    const root = tempRepo();
    mkdirSync(join(root, "docs", "research"), { recursive: true });
    mkdirSync(join(root, "docs", "templates"), { recursive: true });
    writeFileSync(
      join(root, "docs", "research", "wrong-type.md"),
      ["---", "type: guide", "last_updated: 2026-04-23", "---", "# Research"].join("\n"),
    );
    writeFileSync(
      join(root, "docs", "templates", "missing-date.md"),
      ["---", "type: template", "---", "# Template"].join("\n"),
    );
    writeFileSync(
      join(root, "docs", "templates", "blueprint-template.md"),
      ["---", "type: blueprint", "last_updated: 2026-04-23", "---", "# Blueprint Template"].join(
        "\n",
      ),
    );

    const result = auditDocsFrontmatter(root);

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: "docs/research/wrong-type.md",
          message: expect.stringContaining("type"),
        }),
        expect.objectContaining({
          file: "docs/templates/missing-date.md",
          message: expect.stringContaining("last_updated"),
        }),
      ]),
    );
    expect(
      result.violations.some(
        (violation) => violation.file === "docs/templates/blueprint-template.md",
      ),
    ).toBe(false);
  });

  test("blueprint lifecycle audit enforces derived-only .omx handoff markers when legacy OMX checks are enabled", () => {
    const root = tempRepo();
    mkdirSync(join(root, ".omx", "plans"), { recursive: true });
    writeFileSync(join(root, ".omx", "plans", "prd-route-split.md"), "# PRD: Route split\n");
    writeFileSync(
      join(root, ".omx", "plans", "test-spec-route-split.md"),
      "# Test Spec: Route split\n",
    );

    const missingLegacy = auditBlueprintLifecycle(root, {
      includeOmxPlans: true,
    });

    expect(missingLegacy.ok).toBe(false);
    expect(missingLegacy.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message:
            ".omx/plans must be a derived blueprint handoff, not an authoritative PRD/test-spec",
        }),
        expect.objectContaining({
          message: ".omx/plans handoff is missing required derived-handoff marker: derived: true",
        }),
      ]),
    );

    const derivedHandoff = [
      "---",
      "derived: true",
      "non-authoritative: true",
      "blueprint_slug: route-split",
      "blueprint_path: blueprints/planned/route-split/_overview.md",
      "content_hash: abc123",
      "head_at_ingest: def456",
      "---",
      "",
      "# Derived Blueprint Handoff",
    ].join("\n");
    writeFileSync(join(root, ".omx", "plans", "prd-route-split.md"), derivedHandoff);
    writeFileSync(join(root, ".omx", "plans", "test-spec-route-split.md"), derivedHandoff);

    expect(auditBlueprintLifecycle(root, { includeOmxPlans: true }).ok).toBe(true);
  });

  test("blueprint lifecycle audit enforces folder/status agreement and required overview files", () => {
    const root = tempRepo();
    mkdirSync(join(root, "blueprints", "planned", "split-routes"), {
      recursive: true,
    });
    mkdirSync(join(root, "blueprints", "completed", "missing-overview"), {
      recursive: true,
    });
    writeFileSync(
      join(root, "blueprints", "planned", "split-routes", "_overview.md"),
      ["---", "type: blueprint", "status: completed", "---", "# Split Routes"].join("\n"),
    );

    const result = auditBlueprintLifecycle(root);

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: "blueprints/planned/split-routes/_overview.md",
          message: expect.stringContaining("planned"),
        }),
        expect.objectContaining({
          file: "blueprints/completed/missing-overview/_overview.md",
          message: expect.stringContaining("Missing"),
        }),
      ]),
    );
  });

  test("blueprint lifecycle audit enforces local-only parent_roadmap and depends_on for active blueprints", () => {
    const root = tempRepo();
    mkdirSync(join(root, "blueprints", "planned", "child-a"), { recursive: true });
    writeFileSync(
      join(root, "blueprints", "planned", "child-a", "_overview.md"),
      [
        "---",
        "type: blueprint",
        "status: planned",
        "complexity: M",
        'parent_roadmap: "cross-repo: webpresso/monorepo → roadmap-a"',
        "depends_on:",
        "  - https://github.com/webpresso/framework/blob/main/blueprints/planned/public-secret-surface-hard-cut/_overview.md",
        "---",
        "# Child",
      ].join("\n"),
    );

    const result = auditBlueprintLifecycle(root);

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: "blueprints/planned/child-a/_overview.md",
          message: expect.stringContaining("parent_roadmap must reference a local roadmap"),
        }),
        expect.objectContaining({
          file: "blueprints/planned/child-a/_overview.md",
          message: expect.stringContaining("depends_on must stay repo-local"),
        }),
      ]),
    );
  });

  test("blueprint lifecycle audit validates cross_repo_depends_on object shape for active blueprints", () => {
    const root = tempRepo();
    mkdirSync(join(root, "blueprints", "planned", "child-a"), { recursive: true });
    writeFileSync(
      join(root, "blueprints", "planned", "child-a", "_overview.md"),
      [
        "---",
        "type: blueprint",
        "status: planned",
        "complexity: M",
        "cross_repo_depends_on:",
        "  - repo: https://github.com/webpresso/framework",
        "    slug: planned/public-secret-surface-hard-cut/_overview.md",
        "    require_status: shipping",
        "---",
        "# Child",
      ].join("\n"),
    );

    const result = auditBlueprintLifecycle(root);

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: "blueprints/planned/child-a/_overview.md",
          message: expect.stringContaining("owner/repo"),
        }),
        expect.objectContaining({
          file: "blueprints/planned/child-a/_overview.md",
          message: expect.stringContaining("slug must be a blueprint slug only"),
        }),
        expect.objectContaining({
          file: "blueprints/planned/child-a/_overview.md",
          message: expect.stringContaining(
            "require_status must be a valid blueprint lifecycle status",
          ),
        }),
      ]),
    );
  });

  test("blueprint lifecycle audit accepts structured cross_repo_depends_on objects", () => {
    const root = tempRepo();
    mkdirSync(join(root, "blueprints", "planned", "child-a"), { recursive: true });
    writeFileSync(
      join(root, "blueprints", "planned", "child-a", "_overview.md"),
      [
        "---",
        "type: blueprint",
        "title: Child",
        "owner: alice",
        "status: planned",
        "complexity: M",
        "last_updated: 2026-06-04",
        "depends_on: []",
        "cross_repo_depends_on:",
        "  - repo: webpresso/framework",
        "    slug: public-secret-surface-hard-cut",
        "    require_status: planned",
        "---",
        "# Child",
      ].join("\n"),
    );

    const result = auditBlueprintLifecycle(root);

    expect(result.ok).toBe(true);
  });

  test("blueprint lifecycle audit grandfathers completed legacy cross-repo parent_roadmap values", () => {
    const root = tempRepo();
    mkdirSync(join(root, "blueprints", "completed", "child-a"), { recursive: true });
    writeFileSync(
      join(root, "blueprints", "completed", "child-a", "_overview.md"),
      [
        "---",
        "type: blueprint",
        "title: Child",
        "owner: alice",
        "status: completed",
        "complexity: M",
        "last_updated: 2026-06-04",
        'parent_roadmap: "cross-repo: webpresso/monorepo → roadmap-a"',
        "---",
        "# Child",
      ].join("\n"),
    );

    const result = auditBlueprintLifecycle(root);

    expect(result.ok).toBe(true);
  });

  test("validateCommitMessage rejects empty subject", () => {
    const result = validateCommitMessage("\n\nbody\n");
    expect(result.ok).toBe(false);
    expect(result.violations[0]!.message).toContain("required");
  });

  test("validateCommitMessage accepts merge and revert commits", () => {
    expect(validateCommitMessage("Merge branch main").ok).toBe(true);
    expect(validateCommitMessage('Revert "old commit"').ok).toBe(true);
    expect(validateCommitMessage("fixup! WIP commit").ok).toBe(true);
    expect(validateCommitMessage("squash! old commit").ok).toBe(true);
  });

  test("validateCommitMessage rejects subject too long", () => {
    const longSubject = "feat(webpresso): " + "a".repeat(120);
    const result = validateCommitMessage(longSubject, { subjectMaxLength: 100 });
    expect(result.ok).toBe(false);
    expect(result.violations[0]!.message).toContain("100");
  });

  test("validateCommitMessage warns on missing blank second line", () => {
    const result = validateCommitMessage(["feat: do something", "body content"].join("\n"));
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.message.includes("blank"))).toBe(true);
  });

  test("validateCommitMessage enforces lore trailers when subject includes [lore]", () => {
    const result = validateCommitMessage(
      ["feat(webpresso): share repo audits [lore]", "", "Move repeated repo validation."].join(
        "\n",
      ),
    );
    expect(result.ok).toBe(false);
  });

  test("validateCommitMessage enforces lore trailers when requireLore is true", () => {
    const result = validateCommitMessage(
      ["feat(webpresso): something", "", "Regular commit without lore."].join("\n"),
      { requireLore: true },
    );
    expect(result.ok).toBe(false);
  });

  test("auditCatalogDrift returns ok when no workspace file exists", () => {
    const root = tempRepo();
    const result = auditCatalogDrift(root);
    expect(result.ok).toBe(true);
    expect(result.title).toContain("single package");
  });

  test("auditDocsFrontmatter --fix prepends missing frontmatter for bare docs", () => {
    const root = tempRepo();
    mkdirSync(join(root, "docs"), { recursive: true });
    const file = join(root, "docs", "guide.md");
    writeFileSync(file, "# Hello\n");

    const result = auditDocsFrontmatter(root, { fix: true, today: "2026-05-06" });

    expect(result.ok).toBe(true);
    expect(readFileSync(file, "utf8")).toContain(
      "# TODO: classify type — auto-set by wp\ntype: guide\nlast_updated: '2026-05-06'",
    );
  });

  test("auditDocsFrontmatter --fix adds only missing fields inside existing frontmatter", () => {
    const root = tempRepo();
    mkdirSync(join(root, "docs", "research"), { recursive: true });
    const file = join(root, "docs", "research", "note.md");
    writeFileSync(file, "---\ntype: research\n---\n\nBody\n");

    const result = auditDocsFrontmatter(root, { fix: true, today: "2026-05-06" });

    expect(result.ok).toBe(true);
    expect(readFileSync(file, "utf8")).toContain("type: research\nlast_updated: '2026-05-06'");
    expect(readFileSync(file, "utf8")).not.toContain("type: guide");
  });

  test("auditDocsFrontmatter --fix is idempotent", () => {
    const root = tempRepo();
    mkdirSync(join(root, "docs"), { recursive: true });
    const file = join(root, "docs", "guide.md");
    writeFileSync(file, "# Hello\n");

    auditDocsFrontmatter(root, { fix: true, today: "2026-05-06" });
    const once = readFileSync(file, "utf8");
    auditDocsFrontmatter(root, { fix: true, today: "2026-05-06" });
    const twice = readFileSync(file, "utf8");

    expect(twice).toBe(once);
  });

  test("auditCatalogDrift returns ok for empty workspace", () => {
    const root = tempRepo();
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    const result = auditCatalogDrift(root);
    expect(result.ok).toBe(true);
  });

  test("auditDocsFrontmatter returns ok when docs dir does not exist", () => {
    const root = tempRepo();
    const result = auditDocsFrontmatter(root);
    expect(result.ok).toBe(true);
  });

  test("auditBlueprintLifecycle without legacy omx skips legacy checks", () => {
    const root = tempRepo();
    mkdirSync(join(root, "blueprints", "draft", "test"), { recursive: true });
    writeFileSync(
      join(root, "blueprints", "draft", "test", "_overview.md"),
      ["---", "type: blueprint", "status: draft", "---", "# Test"].join("\n"),
    );
    const result = auditBlueprintLifecycle(root);
    expect(result.ok).toBe(true);
  });

  test("formatRepoAuditReport includes ok status", () => {
    const result = { ok: true, title: "Test", checked: 1, violations: [] };
    expect(formatRepoAuditReport(result)).toContain("OK");
  });

  test("auditNoRelativeParentImports finds relative parent import violations", () => {
    const root = tempRepo();
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "foo.ts"), "import something from '../../secret/data'\n");
    const result = auditNoRelativeParentImports(root);
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.message).toContain("relative parent import");
  });

  test("auditNoRelativeParentImports finds deep string traversal (new URL, path.resolve with ../../..)", () => {
    const root = tempRepo();
    mkdirSync(join(root, "src"));
    writeFileSync(
      join(root, "src", "service.ts"),
      `const t = new URL('../../../../catalog/docs/templates/blueprint.md', import.meta.url)\n`,
    );
    const result = auditNoRelativeParentImports(root);
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.message).toContain("fixed-depth path traversal");
  });

  test('auditNoRelativeParentImports finds deep argument traversal (join/resolve with 3+ ".." args)', () => {
    const root = tempRepo();
    mkdirSync(join(root, "src"));
    writeFileSync(
      join(root, "src", "service.ts"),
      `const p = path.resolve(bundleDir, '..', '..', '..')\n`,
    );
    const result = auditNoRelativeParentImports(root);
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.message).toContain("fixed-depth path traversal");
  });

  test("auditNoRelativeParentImports does not flag shallow traversal or legitimate uses", () => {
    const root = tempRepo();
    mkdirSync(join(root, "src"));
    writeFileSync(
      join(root, "src", "service.ts"),
      [
        `const parentDir = join(fullPath, '..')`,
        `const fromSource = new URL('../../audit/name', import.meta.url)`,
        `const p = path.resolve(bundleDir, '..')`,
      ].join("\n") + "\n",
    );
    const result = auditNoRelativeParentImports(root);
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  test("auditNoRelativeParentImports skips _sandbox/ directory", () => {
    const root = tempRepo();
    mkdirSync(join(root, "src"));
    mkdirSync(join(root, "_sandbox", "stale-project", "src"), { recursive: true });
    // violation inside _sandbox — must be ignored
    writeFileSync(
      join(root, "_sandbox", "stale-project", "src", "bad.ts"),
      "import foo from '../../../secret'\n",
    );
    // clean canonical source
    writeFileSync(join(root, "src", "good.ts"), "export const x = 1\n");
    const result = auditNoRelativeParentImports(root);
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  test("auditDocsFrontmatter skips _sandbox/ directory", () => {
    const root = tempRepo();
    mkdirSync(join(root, "docs", "guides"), { recursive: true });
    mkdirSync(join(root, "_sandbox", "old-docs", "research"), { recursive: true });
    // valid doc in canonical tree
    writeFileSync(
      join(root, "docs", "guides", "valid.md"),
      "---\ntype: guide\nlast_updated: 2026-01-01\n---\n# Valid\n",
    );
    // invalid doc inside _sandbox — missing frontmatter, must be ignored
    writeFileSync(
      join(root, "_sandbox", "old-docs", "research", "stale.md"),
      "# No frontmatter at all\n",
    );
    // auditDocsFrontmatter only walks the docs/ subtree, but walkMarkdownFiles
    // must skip _sandbox/ if it appears inside docs/
    mkdirSync(join(root, "docs", "_sandbox", "junk"), { recursive: true });
    writeFileSync(join(root, "docs", "_sandbox", "junk", "bad.md"), "# also no frontmatter\n");
    const result = auditDocsFrontmatter(root);
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  test("walkTsconfigParentPaths (via auditNoRelativeParentImports) skips _sandbox/ tsconfigs", () => {
    const root = tempRepo();
    mkdirSync(join(root, "src"));
    mkdirSync(join(root, "_sandbox", "old-pkg"), { recursive: true });
    writeFileSync(join(root, "src", "index.ts"), "export const x = 1\n");
    // tsconfig inside _sandbox uses a parent-relative extends — must not surface
    writeFileSync(
      join(root, "_sandbox", "old-pkg", "tsconfig.json"),
      JSON.stringify({ extends: "../../../tsconfig.base.json" }),
    );
    // clean root tsconfig
    writeFileSync(join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: {} }));
    const result = auditNoRelativeParentImports(root);
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});

describe("validateCommitMessage — branch coverage", () => {
  // ConditionalExpression: subject.length === 0 boundary
  test("empty string subject triggers required violation and early return", () => {
    const result = validateCommitMessage("");
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.message).toBe("Commit subject is required");
    expect(result.checked).toBe(1);
  });

  test("single-char subject does not trigger empty-subject violation", () => {
    const result = validateCommitMessage("x");
    expect(
      result.violations.every((v: RepoAuditViolation) => !v.message.includes("required")),
    ).toBe(true);
  });

  // ConditionalExpression: /^(Merge|Revert|fixup!|squash!)/ — each keyword
  test.each([["Merge branch main"], ['Revert "old"'], ["fixup! something"], ["squash! something"]])(
    'exempt prefix "%s" returns ok with zero violations',
    (subject) => {
      const result = validateCommitMessage(subject);
      expect(result.ok).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.checked).toBe(1);
    },
  );

  // Regex: /^(?<type>[a-z]+)(?:\([^)]+\))?!?: .+/ — near-misses that must fail
  test.each([
    ["FEAT: something", "uppercase type should fail"],
    ["feat something", "missing colon+space should fail"],
    ["feat:", "no summary after colon should fail"],
    [": no type", "empty type prefix should fail"],
    ["123feat: stuff", "type must start with lowercase letter"],
  ])("conventional format near-miss: %s", (subject, _desc) => {
    const result = validateCommitMessage(subject);
    expect(
      result.violations.some((v: RepoAuditViolation) => v.message.includes("conventional")),
    ).toBe(true);
  });

  test("conventional match with scope passes", () => {
    const result = validateCommitMessage("feat(scope): do something");
    expect(
      result.violations.every((v: RepoAuditViolation) => !v.message.includes("conventional")),
    ).toBe(true);
  });

  test("conventional match with breaking marker passes", () => {
    const result = validateCommitMessage("feat!: breaking change");
    expect(
      result.violations.every((v: RepoAuditViolation) => !v.message.includes("conventional")),
    ).toBe(true);
  });

  test("conventional match with scope and breaking marker passes", () => {
    const result = validateCommitMessage("feat(scope)!: breaking");
    expect(
      result.violations.every((v: RepoAuditViolation) => !v.message.includes("conventional")),
    ).toBe(true);
  });

  // EqualityOperator: subject.length > subjectMaxLength boundary
  test("subject at exactly subjectMaxLength does not violate", () => {
    const subject = "feat: " + "a".repeat(94); // total 100 chars
    const result = validateCommitMessage(subject, { subjectMaxLength: 100 });
    expect(result.violations.every((v: RepoAuditViolation) => !v.message.includes("100"))).toBe(
      true,
    );
  });

  test("subject at subjectMaxLength + 1 violates", () => {
    const subject = "feat: " + "a".repeat(95); // total 101 chars
    const result = validateCommitMessage(subject, { subjectMaxLength: 100 });
    expect(result.violations.some((v: RepoAuditViolation) => v.message.includes("100"))).toBe(true);
  });

  test("custom subjectMaxLength is used instead of default", () => {
    const subject = "feat: " + "a".repeat(45); // total 51 chars — over 50, under 100
    expect(validateCommitMessage(subject, { subjectMaxLength: 50 }).ok).toBe(false);
    expect(validateCommitMessage(subject, { subjectMaxLength: 100 }).ok).toBe(true);
  });

  // ConditionalExpression: lines.length > 1 && lines[1] !== ''
  test("single-line commit does not trigger blank-second-line violation", () => {
    const result = validateCommitMessage("feat: single line");
    expect(result.violations.every((v: RepoAuditViolation) => !v.message.includes("blank"))).toBe(
      true,
    );
  });

  test("two lines where second is blank is valid", () => {
    const result = validateCommitMessage("feat: subject\n\nbody");
    expect(result.violations.every((v: RepoAuditViolation) => !v.message.includes("blank"))).toBe(
      true,
    );
  });

  // LogicalOperator: shouldEnforceLore branches
  // loreWarn=true activates the lore validation path; bad Confidence enum value → violation even in warn mode
  test("loreWarn with invalid Confidence value produces violation (enum error propagates in warn mode)", () => {
    const result = validateCommitMessage(
      [
        "feat: something",
        "",
        "body",
        "",
        "Confidence: extremely-high",
        "Directive: do the thing",
      ].join("\n"),
      { loreWarn: true },
    );
    // Invalid Confidence enum → violation even with loreWarn (not requireLore)
    expect(result.ok).toBe(false);
    expect(
      result.violations.some((v: RepoAuditViolation) =>
        v.message.toLowerCase().includes("confidence"),
      ),
    ).toBe(true);
  });

  test("neither requireLore nor loreWarn nor [lore] — lore not enforced", () => {
    const result = validateCommitMessage(
      ["feat: something", "", "body without trailers"].join("\n"),
    );
    expect(
      result.violations.every((v: RepoAuditViolation) => !v.message.includes("Confidence")),
    ).toBe(true);
  });

  // ConditionalExpression: options.requireLore === true || subject.includes('[lore]') in loreResult call
  test("[lore] in subject requires Confidence trailer even without requireLore option", () => {
    const result = validateCommitMessage(
      ["feat: something [lore]", "", "body without trailers"].join("\n"),
    );
    expect(result.ok).toBe(false);
    expect(
      result.violations.some((v: RepoAuditViolation) => v.message.includes("Confidence")),
    ).toBe(true);
  });

  // allowedTypes — custom list
  test("custom allowedTypes accepts only listed types", () => {
    const result = validateCommitMessage("chore: some task", { allowedTypes: ["feat", "fix"] });
    expect(
      result.violations.some((v: RepoAuditViolation) => v.message.includes("conventional")),
    ).toBe(true);
  });

  test("custom allowedTypes permits type in list", () => {
    const result = validateCommitMessage("feat: something", { allowedTypes: ["feat", "fix"] });
    expect(
      result.violations.every((v: RepoAuditViolation) => !v.message.includes("conventional")),
    ).toBe(true);
  });

  // CRLF normalization
  test("CRLF line endings are normalised correctly", () => {
    const result = validateCommitMessage("feat: something\r\n\r\nbody");
    expect(result.violations.every((v: RepoAuditViolation) => !v.message.includes("blank"))).toBe(
      true,
    );
  });
});

describe("formatRepoAuditReport — branch coverage", () => {
  test("formats FAILED status correctly", () => {
    const result = {
      ok: false,
      title: "Catalog drift",
      checked: 3,
      violations: [{ file: "pkg/a.json", message: "foo is wrong" }],
    };
    const report = formatRepoAuditReport(result);
    expect(report).toBe("Catalog drift: FAILED (3 checked)\n- pkg/a.json: foo is wrong");
  });

  test("formats OK status with zero violations correctly", () => {
    const result = { ok: true, title: "Blueprint lifecycle", checked: 5, violations: [] };
    const report = formatRepoAuditReport(result);
    expect(report).toBe("Blueprint lifecycle: OK (5 checked)");
  });

  test("violation without file omits file prefix", () => {
    const result = {
      ok: false,
      title: "Commit message",
      checked: 1,
      violations: [{ message: "subject required" }],
    };
    const report = formatRepoAuditReport(result);
    expect(report).toBe("Commit message: FAILED (1 checked)\n- subject required");
  });

  test("multiple violations are each on their own line", () => {
    const result = {
      ok: false,
      title: "T",
      checked: 2,
      violations: [
        { file: "a.ts", message: "err1" },
        { file: "b.ts", message: "err2" },
      ],
    };
    const lines = formatRepoAuditReport(result).split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe("- a.ts: err1");
    expect(lines[2]).toBe("- b.ts: err2");
  });
});

describe("auditCatalogDrift — branch coverage", () => {
  test("custom workspaceFile option is respected", () => {
    const root = tempRepo();
    writeFileSync(join(root, "my-workspace.yaml"), "packages:\n  - packages/*\n");
    // No packages dir, so no package files → ok
    const result = auditCatalogDrift(root, { workspaceFile: "my-workspace.yaml" });
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(0);
  });

  test("returns ok with checked count when packages have no drift", () => {
    const root = tempRepo();
    mkdirSync(join(root, "packages", "a"), { recursive: true });
    mkdirSync(join(root, "packages", "b"), { recursive: true });
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    writeJson(join(root, "packages", "a", "package.json"), {
      name: "@repo/a",
      dependencies: { react: "catalog:" },
    });
    writeJson(join(root, "packages", "b", "package.json"), {
      name: "@repo/b",
      dependencies: { react: "catalog:" },
    });
    const result = auditCatalogDrift(root);
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(2);
  });

  test('catalogNames.has branch: uses "use catalog:" hint when dep already in catalog', () => {
    const root = tempRepo();
    mkdirSync(join(root, "packages", "a"), { recursive: true });
    mkdirSync(join(root, "packages", "b"), { recursive: true });
    writeFileSync(
      join(root, "pnpm-workspace.yaml"),
      ["packages:", "  - packages/*", "catalog:", "  react: ^19.0.0", ""].join("\n"),
    );
    writeJson(join(root, "packages", "a", "package.json"), {
      name: "@repo/a",
      dependencies: { react: "^19.0.0" },
    });
    writeJson(join(root, "packages", "b", "package.json"), {
      name: "@repo/b",
      dependencies: { react: "^19.0.0" },
    });
    const result = auditCatalogDrift(root);
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.message).toContain("use catalog:");
    expect(result.violations[0]?.message).not.toContain("promote it");
  });

  test('dep NOT in catalog uses "promote it" hint', () => {
    const root = tempRepo();
    mkdirSync(join(root, "packages", "a"), { recursive: true });
    mkdirSync(join(root, "packages", "b"), { recursive: true });
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    writeJson(join(root, "packages", "a", "package.json"), {
      name: "@repo/a",
      dependencies: { lodash: "^4.17.0" },
    });
    writeJson(join(root, "packages", "b", "package.json"), {
      name: "@repo/b",
      dependencies: { lodash: "^4.17.0" },
    });
    const result = auditCatalogDrift(root);
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.message).toContain("promote it to the pnpm catalog");
  });

  // EqualityOperator: uses.length < 2 — exactly 1 usage must NOT produce violation
  test("dep used in only one workspace does not produce drift violation", () => {
    const root = tempRepo();
    mkdirSync(join(root, "packages", "a"), { recursive: true });
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    writeJson(join(root, "packages", "a", "package.json"), {
      name: "@repo/a",
      dependencies: { lodash: "^4.17.0" },
    });
    const result = auditCatalogDrift(root);
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  // isSharedDependencyReference: each prefix variant
  test.each([["catalog:react"], ["workspace:*"], ["file:../local"], ["link:../linked"]])(
    'shared reference "%s" is not flagged',
    (version) => {
      const root = tempRepo();
      mkdirSync(join(root, "packages", "a"), { recursive: true });
      mkdirSync(join(root, "packages", "b"), { recursive: true });
      writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
      writeJson(join(root, "packages", "a", "package.json"), {
        name: "@repo/a",
        dependencies: { react: version },
      });
      writeJson(join(root, "packages", "b", "package.json"), {
        name: "@repo/b",
        dependencies: { react: version },
      });
      const result = auditCatalogDrift(root);
      expect(result.ok).toBe(true);
    },
  );

  test("peerDependencies are not checked for drift", () => {
    const root = tempRepo();
    mkdirSync(join(root, "packages", "a"), { recursive: true });
    mkdirSync(join(root, "packages", "b"), { recursive: true });
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    writeJson(join(root, "packages", "a", "package.json"), {
      name: "@repo/a",
      peerDependencies: { react: ">=18" },
    });
    writeJson(join(root, "packages", "b", "package.json"), {
      name: "@repo/b",
      peerDependencies: { react: ">=18" },
    });
    const result = auditCatalogDrift(root);
    expect(result.ok).toBe(true);
  });

  test("exact workspace path (non-glob) is resolved correctly", () => {
    const root = tempRepo();
    mkdirSync(join(root, "infra"), { recursive: true });
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - infra\n");
    writeJson(join(root, "infra", "package.json"), { name: "@repo/infra", dependencies: {} });
    const result = auditCatalogDrift(root);
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(1);
  });

  test("does not double-count one workspace when a dependency appears in multiple sections", () => {
    const root = tempRepo();
    mkdirSync(join(root, "apps", "one"), { recursive: true });
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - .\n  - apps/*\n");
    writeJson(join(root, "package.json"), {
      name: "@repo/root",
      dependencies: { vitest: "^4.1.7" },
      devDependencies: { vitest: "latest" },
      optionalDependencies: { vitest: "^4.1.7" },
    });
    writeJson(join(root, "apps", "one", "package.json"), {
      name: "@repo/one",
      devDependencies: { "@webpresso/agent-kit": "latest" },
    });

    const result = auditCatalogDrift(root);

    expect(result.ok).toBe(true);
    expect(result.checked).toBe(2);
    expect(result.violations).toHaveLength(0);
  });
});

describe("auditDocsFrontmatter — branch coverage", () => {
  test("file without type field produces missing-type violation", () => {
    const root = tempRepo();
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(
      join(root, "docs", "noType.md"),
      ["---", "last_updated: 2026-01-01", "---", "# doc"].join("\n"),
    );
    const result = auditDocsFrontmatter(root);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v: RepoAuditViolation) => v.message.includes("type"))).toBe(
      true,
    );
  });

  test("file with invalid type (not in allowedTypes) produces invalid-type violation", () => {
    const root = tempRepo();
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(
      join(root, "docs", "bad.md"),
      ["---", "type: unknown-type", "last_updated: 2026-01-01", "---", "# doc"].join("\n"),
    );
    const result = auditDocsFrontmatter(root);
    expect(result.ok).toBe(false);
    expect(
      result.violations.some((v: RepoAuditViolation) => v.message.includes("Invalid type")),
    ).toBe(true);
  });

  test("file without last_updated produces missing-last_updated violation", () => {
    const root = tempRepo();
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(
      join(root, "docs", "noDate.md"),
      ["---", "type: guide", "---", "# doc"].join("\n"),
    );
    const result = auditDocsFrontmatter(root);
    expect(result.ok).toBe(false);
    expect(
      result.violations.some((v: RepoAuditViolation) => v.message.includes("last_updated")),
    ).toBe(true);
  });

  // ConditionalExpression: folder === 'templates' skips type validation
  test("templates/ folder skips invalid-type and folder-type-contract checks", () => {
    const root = tempRepo();
    mkdirSync(join(root, "docs", "templates"), { recursive: true });
    writeFileSync(
      join(root, "docs", "templates", "custom.md"),
      ["---", "type: anything-goes", "last_updated: 2026-01-01", "---", "# T"].join("\n"),
    );
    const result = auditDocsFrontmatter(root);
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  // ConditionalExpression: folder !== 'templates' && expectedType && type && type !== expectedType
  test("correct folder type contract passes", () => {
    const root = tempRepo();
    mkdirSync(join(root, "docs", "adrs"), { recursive: true });
    writeFileSync(
      join(root, "docs", "adrs", "correct.md"),
      ["---", "type: adr", "last_updated: 2026-01-01", "---", "# ADR"].join("\n"),
    );
    const result = auditDocsFrontmatter(root);
    expect(result.ok).toBe(true);
  });

  test("wrong type in adrs/ folder produces folder-type-contract violation", () => {
    const root = tempRepo();
    mkdirSync(join(root, "docs", "adrs"), { recursive: true });
    writeFileSync(
      join(root, "docs", "adrs", "wrong.md"),
      ["---", "type: guide", "last_updated: 2026-01-01", "---", "# ADR"].join("\n"),
    );
    const result = auditDocsFrontmatter(root);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v: RepoAuditViolation) => v.message.includes("adrs/"))).toBe(
      true,
    );
    expect(result.violations.some((v: RepoAuditViolation) => v.message.includes("adr"))).toBe(true);
  });

  test("custom docsRoot option is respected", () => {
    const root = tempRepo();
    mkdirSync(join(root, "documentation"), { recursive: true });
    writeFileSync(
      join(root, "documentation", "item.md"),
      ["---", "type: guide", "last_updated: 2026-01-01", "---", "# G"].join("\n"),
    );
    const result = auditDocsFrontmatter(root, { docsRoot: "documentation" });
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(1);
  });

  test("custom allowedTypes restricts valid type set", () => {
    const root = tempRepo();
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(
      join(root, "docs", "item.md"),
      ["---", "type: guide", "last_updated: 2026-01-01", "---", "# G"].join("\n"),
    );
    // guide is a default type but not in our custom list
    const result = auditDocsFrontmatter(root, { allowedTypes: ["adr", "research"] });
    expect(result.ok).toBe(false);
    expect(
      result.violations.some((v: RepoAuditViolation) => v.message.includes("Invalid type")),
    ).toBe(true);
  });

  test("returns correct checked count", () => {
    const root = tempRepo();
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(
      join(root, "docs", "a.md"),
      ["---", "type: guide", "last_updated: 2026-01-01", "---", "# A"].join("\n"),
    );
    writeFileSync(
      join(root, "docs", "b.md"),
      ["---", "type: guide", "last_updated: 2026-01-01", "---", "# B"].join("\n"),
    );
    const result = auditDocsFrontmatter(root);
    expect(result.checked).toBe(2);
  });
});

describe("auditBlueprintLifecycle — branch coverage", () => {
  test("blueprint with correct type and status passes", () => {
    const root = tempRepo();
    mkdirSync(join(root, "blueprints", "in-progress", "my-feature"), { recursive: true });
    writeFileSync(
      join(root, "blueprints", "in-progress", "my-feature", "_overview.md"),
      [
        "---",
        "type: blueprint",
        "title: My Feature",
        "owner: alice",
        "status: in-progress",
        "complexity: M",
        "last_updated: 2026-06-04",
        "---",
        "# My Feature",
      ].join("\n"),
    );
    const result = auditBlueprintLifecycle(root);
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(1);
  });

  test("flat blueprint with correct type and status is counted and validated", () => {
    const root = tempRepo();
    mkdirSync(join(root, "blueprints", "in-progress"), { recursive: true });
    writeFileSync(
      join(root, "blueprints", "in-progress", "my-feature.md"),
      [
        "---",
        "type: blueprint",
        "title: My Feature",
        "owner: alice",
        "status: in-progress",
        "complexity: M",
        "last_updated: 2026-06-04",
        "---",
        "# My Feature",
      ].join("\n"),
    );
    const result = auditBlueprintLifecycle(root);
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(1);
  });

  test("non-draft blueprints require title, owner, complexity, and last_updated", () => {
    const root = tempRepo();
    mkdirSync(join(root, "blueprints", "planned", "missing-fields"), { recursive: true });
    writeFileSync(
      join(root, "blueprints", "planned", "missing-fields", "_overview.md"),
      ["---", "type: blueprint", "status: planned", "---", "# Missing Fields"].join("\n"),
    );
    const result = auditBlueprintLifecycle(root);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v: RepoAuditViolation) => v.message.includes("title"))).toBe(
      true,
    );
    expect(result.violations.some((v: RepoAuditViolation) => v.message.includes("owner"))).toBe(
      true,
    );
    expect(
      result.violations.some((v: RepoAuditViolation) => v.message.includes("last_updated")),
    ).toBe(true);
  });

  test("non-draft blueprints reject invalid complexity enum", () => {
    const root = tempRepo();
    mkdirSync(join(root, "blueprints", "planned", "bad-complexity"), { recursive: true });
    writeFileSync(
      join(root, "blueprints", "planned", "bad-complexity", "_overview.md"),
      [
        "---",
        "type: blueprint",
        "title: Bad Complexity",
        "owner: alice",
        "status: planned",
        "complexity: XXL",
        "last_updated: 2026-06-04",
        "---",
        "# Bad Complexity",
      ].join("\n"),
    );
    const result = auditBlueprintLifecycle(root);
    expect(result.ok).toBe(false);
    expect(
      result.violations.some((v: RepoAuditViolation) => v.message.includes("complexity")),
    ).toBe(true);
  });

  test("draft blueprints remain exempt from the strict required-field subset", () => {
    const root = tempRepo();
    mkdirSync(join(root, "blueprints", "draft", "loose-draft"), { recursive: true });
    writeFileSync(
      join(root, "blueprints", "draft", "loose-draft", "_overview.md"),
      ["---", "type: blueprint", "status: draft", "---", "# Loose Draft"].join("\n"),
    );
    const result = auditBlueprintLifecycle(root);
    expect(result.ok).toBe(true);
  });

  test("draft blueprint with checked acceptance criteria fails lifecycle audit", () => {
    const root = tempRepo();
    mkdirSync(join(root, "blueprints", "draft", "done-draft"), { recursive: true });
    writeFileSync(
      join(root, "blueprints", "draft", "done-draft", "_overview.md"),
      [
        "---",
        "type: blueprint",
        "status: draft",
        "---",
        "# Done Draft",
        "",
        "## Acceptance",
        "",
        "- [x] Implemented",
      ].join("\n"),
    );

    const result = auditBlueprintLifecycle(root);

    expect(result.ok).toBe(false);
    expect(
      result.violations.some(
        (violation: RepoAuditViolation) =>
          violation.file === "blueprints/draft/done-draft/_overview.md" &&
          violation.message.includes(
            "Plan has status: draft but 1 acceptance criteria are checked",
          ),
      ),
    ).toBe(true);
  });

  test("blueprint with wrong type produces type violation", () => {
    const root = tempRepo();
    mkdirSync(join(root, "blueprints", "draft", "bp"), { recursive: true });
    writeFileSync(
      join(root, "blueprints", "draft", "bp", "_overview.md"),
      ["---", "type: guide", "status: draft", "---", "# BP"].join("\n"),
    );
    const result = auditBlueprintLifecycle(root);
    expect(result.ok).toBe(false);
    expect(
      result.violations.some((v: RepoAuditViolation) => v.message.includes("type: blueprint")),
    ).toBe(true);
  });

  test("custom statuses option filters which folders are checked", () => {
    const root = tempRepo();
    mkdirSync(join(root, "blueprints", "draft", "bp"), { recursive: true });
    writeFileSync(
      join(root, "blueprints", "draft", "bp", "_overview.md"),
      // wrong type — but we only check 'completed', so this folder is skipped
      ["---", "type: guide", "status: draft", "---", "# BP"].join("\n"),
    );
    const result = auditBlueprintLifecycle(root, { statuses: ["completed"] });
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(0);
  });

  test("custom blueprintsRoot option is respected", () => {
    const root = tempRepo();
    mkdirSync(join(root, "plans", "draft", "bp"), { recursive: true });
    writeFileSync(
      join(root, "plans", "draft", "bp", "_overview.md"),
      ["---", "type: blueprint", "status: draft", "---", "# BP"].join("\n"),
    );
    const result = auditBlueprintLifecycle(root, { blueprintsRoot: "plans" });
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(1);
  });

  test("non-canonical markdown files directly under status folders are skipped only when not canonical blueprint files", () => {
    const root = tempRepo();
    mkdirSync(join(root, "blueprints", "draft"), { recursive: true });
    // write a file (not a directory) inside the status folder
    writeFileSync(join(root, "blueprints", "draft", "README.md"), "# stray");
    const result = auditBlueprintLifecycle(root);
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(0);
  });

  test("folder blueprints with markdown but no _overview.md fail loudly", () => {
    const root = tempRepo();
    mkdirSync(join(root, "blueprints", "planned", "missing-overview"), { recursive: true });
    writeFileSync(join(root, "blueprints", "planned", "missing-overview", "notes.md"), "# notes");
    const result = auditBlueprintLifecycle(root);
    expect(result.ok).toBe(false);
    expect(
      result.violations.some((violation: RepoAuditViolation) =>
        violation.message.includes("must include _overview.md"),
      ),
    ).toBe(true);
  });

  test("includeOmxPlans false does not add legacy checked count", () => {
    const root = tempRepo();
    const result = auditBlueprintLifecycle(root, { includeOmxPlans: false });
    expect(result.checked).toBe(0);
  });

  test("legacy omx: no legacy surface → no violations and checked stays 0", () => {
    const root = tempRepo();
    const result = auditBlueprintLifecycle(root, { includeOmxPlans: true });
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(0);
  });
});

describe("auditLegacyOmxPlans — derived OMX handoff hardcut", () => {
  function writeDerivedHandoff(root: string, file = "blueprint-handoff.md") {
    mkdirSync(join(root, ".omx", "plans"), { recursive: true });
    writeFileSync(
      join(root, ".omx", "plans", file),
      [
        "---",
        "derived: true",
        "non-authoritative: true",
        "blueprint_slug: hardcut-blueprint",
        "blueprint_path: blueprints/in-progress/hardcut-blueprint/_overview.md",
        "content_hash: abc123",
        "head_at_ingest: def456",
        "codex_goal:",
        "  thread_id: 019e6da9-9002-7b63-a261-88b5844453a0",
        "  status_at_handoff: active",
        "omx_context:",
        "  session_id: omx-1779961577929-bg63ul",
        "  ledger_path: .omx/ultragoal/ledger.jsonl",
        "---",
        "",
        "# Derived Blueprint Handoff",
        "",
        "This file is a launch pointer only; the blueprint is canonical.",
      ].join("\n"),
    );
  }

  test("absence of .omx/plans stays valid", () => {
    const root = tempRepo();
    const result = auditBlueprintLifecycle(root, { includeOmxPlans: true });
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(0);
  });

  test("derived blueprint handoff passes hardcut checks", () => {
    const root = tempRepo();
    writeDerivedHandoff(root);
    const result = auditBlueprintLifecycle(root, { includeOmxPlans: true });
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(1);
  });

  test("authoritative PRD/test-spec files are rejected even when present under .omx/plans", () => {
    const root = tempRepo();
    mkdirSync(join(root, ".omx", "plans"), { recursive: true });
    writeFileSync(join(root, ".omx", "plans", "prd-feature.md"), "# PRD: Feature\n");
    writeFileSync(join(root, ".omx", "plans", "test-spec-feature.md"), "# Test Spec: Feature\n");

    const result = auditBlueprintLifecycle(root, { includeOmxPlans: true });

    expect(result.ok).toBe(false);
    expect(
      result.violations.some((v: RepoAuditViolation) =>
        v.message.includes("derived blueprint handoff, not an authoritative PRD/test-spec"),
      ),
    ).toBe(true);
  });

  test("handoff missing required derived markers is rejected", () => {
    const root = tempRepo();
    mkdirSync(join(root, ".omx", "plans"), { recursive: true });
    writeFileSync(
      join(root, ".omx", "plans", "handoff.md"),
      [
        "---",
        "derived: true",
        "blueprint_slug: hardcut-blueprint",
        "---",
        "# Derived Blueprint Handoff",
      ].join("\n"),
    );

    const result = auditBlueprintLifecycle(root, { includeOmxPlans: true });

    expect(result.ok).toBe(false);
    expect(
      result.violations.some((v: RepoAuditViolation) =>
        v.message.includes("missing required derived-handoff marker: non-authoritative"),
      ),
    ).toBe(true);
    expect(
      result.violations.some((v: RepoAuditViolation) =>
        v.message.includes("missing required derived-handoff marker: content_hash:"),
      ),
    ).toBe(true);
  });

  test("handoff blueprint_path must point at blueprints/", () => {
    const root = tempRepo();
    writeDerivedHandoff(root);
    const file = join(root, ".omx", "plans", "blueprint-handoff.md");
    writeFileSync(
      file,
      readFileSync(file, "utf8").replace(
        "blueprint_path: blueprints/in-progress/hardcut-blueprint/_overview.md",
        "blueprint_path: .omx/plans/prd-feature.md",
      ),
    );

    const result = auditBlueprintLifecycle(root, { includeOmxPlans: true });

    expect(result.ok).toBe(false);
    expect(
      result.violations.some((v: RepoAuditViolation) =>
        v.message.includes("blueprint_path must point at blueprints/"),
      ),
    ).toBe(true);
  });

  test("handoff rejects malformed optional provenance metadata", () => {
    const root = tempRepo();
    writeDerivedHandoff(root);
    const file = join(root, ".omx", "plans", "blueprint-handoff.md");
    writeFileSync(
      file,
      readFileSync(file, "utf8").replace(
        "thread_id: 019e6da9-9002-7b63-a261-88b5844453a0",
        "thread_id:\n    - invalid",
      ),
    );

    const result = auditBlueprintLifecycle(root, { includeOmxPlans: true });

    expect(result.ok).toBe(false);
    expect(
      result.violations.some((v: RepoAuditViolation) =>
        v.message.includes("invalid optional provenance field codex_goal.thread_id"),
      ),
    ).toBe(true);
  });
});

describe("auditNoRelativeParentImports — branch coverage", () => {
  test("test files are skipped (.test.ts)", () => {
    const root = tempRepo();
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "foo.test.ts"), "import something from '../../secret/data'\n");
    const result = auditNoRelativeParentImports(root);
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(0);
  });

  test("test files are skipped (.test.tsx)", () => {
    const root = tempRepo();
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "foo.test.tsx"), "import something from '../../secret/data'\n");
    const result = auditNoRelativeParentImports(root);
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(0);
  });

  test("integration test files are skipped (.integration.test.ts)", () => {
    const root = tempRepo();
    mkdirSync(join(root, "src"));
    writeFileSync(
      join(root, "src", "foo.integration.test.ts"),
      "import something from '../../secret/data'\n",
    );
    const result = auditNoRelativeParentImports(root);
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(0);
  });

  test("node_modules directory is skipped", () => {
    const root = tempRepo();
    mkdirSync(join(root, "src", "node_modules", "pkg"), { recursive: true });
    writeFileSync(
      join(root, "src", "node_modules", "pkg", "index.ts"),
      "import something from '../../secret/data'\n",
    );
    const result = auditNoRelativeParentImports(root);
    expect(result.ok).toBe(true);
  });

  test("dist directory is skipped", () => {
    const root = tempRepo();
    mkdirSync(join(root, "src", "dist"), { recursive: true });
    writeFileSync(
      join(root, "src", "dist", "index.ts"),
      "import something from '../../secret/data'\n",
    );
    const result = auditNoRelativeParentImports(root);
    expect(result.ok).toBe(true);
  });

  test("comment lines are not flagged", () => {
    const root = tempRepo();
    mkdirSync(join(root, "src"));
    writeFileSync(
      join(root, "src", "foo.ts"),
      [
        `// import something from '../../secret/data'`,
        `/* import something from '../../secret/data' */`,
      ].join("\n") + "\n",
    );
    const result = auditNoRelativeParentImports(root);
    expect(result.ok).toBe(true);
  });

  test("export * from parent also flagged", () => {
    const root = tempRepo();
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "index.ts"), "export * from '../other'\n");
    const result = auditNoRelativeParentImports(root);
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.message).toContain("relative parent import");
  });

  test("custom srcDir option is respected", () => {
    const root = tempRepo();
    mkdirSync(join(root, "lib"));
    writeFileSync(join(root, "lib", "foo.ts"), "import x from '../../up'\n");
    const result = auditNoRelativeParentImports(root, { srcDir: "lib" });
    expect(result.ok).toBe(false);
    expect(result.checked).toBe(1);
  });

  test("custom extensions option limits which files are checked", () => {
    const root = tempRepo();
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "foo.ts"), "import x from '../../up'\n");
    // Only check .js, so .ts is skipped
    const result = auditNoRelativeParentImports(root, { extensions: [".js"] });
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(0);
  });

  test("non-existent srcDir returns ok with 0 checked", () => {
    const root = tempRepo();
    const result = auditNoRelativeParentImports(root);
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(0);
  });

  test("violation message includes line number", () => {
    const root = tempRepo();
    mkdirSync(join(root, "src"));
    writeFileSync(
      join(root, "src", "bar.ts"),
      ["const x = 1", "import foo from '../../outside'", "const y = 2"].join("\n") + "\n",
    );
    const result = auditNoRelativeParentImports(root);
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.message).toContain("Line 2:");
  });

  test('deep arg traversal exactly at 2 ".." args is NOT flagged', () => {
    const root = tempRepo();
    mkdirSync(join(root, "src"));
    writeFileSync(
      join(root, "src", "service.ts"),
      `const p = path.resolve(bundleDir, '..', '..')\n`,
    );
    const result = auditNoRelativeParentImports(root);
    expect(result.ok).toBe(true);
  });

  test('deep arg traversal at exactly 3 ".." args IS flagged', () => {
    const root = tempRepo();
    mkdirSync(join(root, "src"));
    writeFileSync(
      join(root, "src", "service.ts"),
      `const p = path.resolve(bundleDir, '..', '..', '..')\n`,
    );
    const result = auditNoRelativeParentImports(root);
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.message).toContain("fixed-depth path traversal");
  });
});

describe("parseFrontmatter — branch coverage", () => {
  // We test indirectly through auditDocsFrontmatter/auditBlueprintLifecycle
  test("markdown without --- front matter returns empty record (no type violation logic skipped)", () => {
    const root = tempRepo();
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "raw.md"), "# Just a title\n\nNo frontmatter.");
    const result = auditDocsFrontmatter(root);
    // Without frontmatter, type and last_updated are both missing
    expect(result.ok).toBe(false);
    expect(result.violations.some((v: RepoAuditViolation) => v.message.includes("type"))).toBe(
      true,
    );
    expect(
      result.violations.some((v: RepoAuditViolation) => v.message.includes("last_updated")),
    ).toBe(true);
  });

  test("frontmatter block not closed (no closing ---) returns empty record", () => {
    const root = tempRepo();
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(
      join(root, "docs", "unclosed.md"),
      ["---", "type: guide", "# missing closing fence"].join("\n"),
    );
    const result = auditDocsFrontmatter(root);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v: RepoAuditViolation) => v.message.includes("type"))).toBe(
      true,
    );
  });
});

describe("auditTestIsolation", () => {
  // Assemble the forbidden token at runtime so THIS test file's own source
  // lines never match the audit's regex when it scans src/ (the audit does a
  // line-level scan and cannot distinguish a string literal from real code).
  // The generated tmp fixtures still contain the literal `process.cwd()` after
  // interpolation, so the audit sees the real pattern.
  const CWD = "process.cwd()";

  test("flags a test that reads the catalog template source via process.cwd()", () => {
    const root = tempRepo();
    mkdirSync(join(root, "src"));
    writeFileSync(
      join(root, "src", "scaffold.test.ts"),
      `const tpl = readFileSync(join(${CWD}, 'catalog', 'AGENTS.md.tpl'), 'utf8')\n`,
    );
    const result = auditTestIsolation(root);
    expect(result.ok).toBe(false);
    expect(result.checked).toBe(1);
    expect(result.violations[0]?.message).toContain("Line 1:");
    expect(result.violations[0]?.message).toContain("resolveCatalogDir()");
  });

  test("flags a test that writes the catalog source via process.cwd()", () => {
    const root = tempRepo();
    mkdirSync(join(root, "src"));
    writeFileSync(
      join(root, "src", "mutate.test.ts"),
      `writeFileSync(resolve(${CWD}, 'catalog', 'agent', 'x.md'), 'oops')\n`,
    );
    const result = auditTestIsolation(root);
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.file).toBe("src/mutate.test.ts");
  });

  test("passes when the test anchors catalog reads to resolveCatalogDir()", () => {
    const root = tempRepo();
    mkdirSync(join(root, "src"));
    writeFileSync(
      join(root, "src", "clean.test.ts"),
      `const tpl = readFileSync(join(resolveCatalogDir(), 'AGENTS.md.tpl'), 'utf8')\n`,
    );
    const result = auditTestIsolation(root);
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(1);
  });

  test("does not flag non-catalog process.cwd() paths (e.g. tmp dirs, fixtures)", () => {
    const root = tempRepo();
    mkdirSync(join(root, "src"));
    writeFileSync(
      join(root, "src", "other.test.ts"),
      [
        `const dir = join(${CWD}, 'test-temp-links')`,
        `const fix = readFileSync(join(${CWD}, 'src/__fixtures__/x.json'), 'utf8')`,
      ].join("\n") + "\n",
    );
    const result = auditTestIsolation(root);
    expect(result.ok).toBe(true);
  });

  test("skips comment lines referencing the pattern", () => {
    const root = tempRepo();
    mkdirSync(join(root, "src"));
    writeFileSync(
      join(root, "src", "commented.test.ts"),
      [
        `// readFileSync(join(${CWD}, 'catalog', 'AGENTS.md.tpl'))`,
        `/* join(${CWD}, 'catalog', 'x') */`,
      ].join("\n") + "\n",
    );
    const result = auditTestIsolation(root);
    expect(result.ok).toBe(true);
  });

  test("only inspects test files, not production source", () => {
    const root = tempRepo();
    mkdirSync(join(root, "src"));
    // Production source resolving the catalog off cwd is out of this audit's
    // scope (resolveCatalogDir lives in production and is the sanctioned path).
    writeFileSync(
      join(root, "src", "prod.ts"),
      `const tpl = readFileSync(join(${CWD}, 'catalog', 'AGENTS.md.tpl'), 'utf8')\n`,
    );
    const result = auditTestIsolation(root);
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(0);
  });
});

describe("auditNoRelativeParentImports — tsconfig coverage", () => {
  test("flags tsconfig.json extends with parent path", () => {
    const root = tempRepo();
    writeFileSync(join(root, "tsconfig.json"), '{\n  "extends": "../base.json"\n}\n');

    const result = auditNoRelativeParentImports(root);

    expect(result.ok).toBe(false);
    expect(result.violations[0]?.file).toBe("tsconfig.json");
    expect(result.violations[0]?.message).toContain("tsconfig parent-relative path");
  });

  test("flags tsconfig parent paths in compilerOptions.paths", () => {
    const root = tempRepo();
    writeFileSync(
      join(root, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: { paths: { "@scope/*": ["../../packages/scope/*"] } },
        },
        null,
        2,
      ) + "\n",
    );

    const result = auditNoRelativeParentImports(root);

    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.message.includes("../../packages/scope/*"))).toBe(true);
  });

  test("flags tsconfig parent paths in references[].path", () => {
    const root = tempRepo();
    writeFileSync(
      join(root, "tsconfig.build.json"),
      JSON.stringify({ references: [{ path: "../other" }] }, null, 2) + "\n",
    );

    const result = auditNoRelativeParentImports(root);

    expect(result.ok).toBe(false);
    expect(result.violations[0]?.file).toBe("tsconfig.build.json");
  });

  test("accepts package-aliased extends without parent paths", () => {
    const root = tempRepo();
    writeFileSync(
      join(root, "tsconfig.json"),
      JSON.stringify(
        {
          extends: "webpresso/tsconfig/library.json",
          compilerOptions: { rootDir: "./src", outDir: "./dist" },
        },
        null,
        2,
      ) + "\n",
    );

    const result = auditNoRelativeParentImports(root);

    expect(result.ok).toBe(true);
  });

  test("skipTsconfig disables the tsconfig scan", () => {
    const root = tempRepo();
    writeFileSync(join(root, "tsconfig.json"), '{ "extends": "../base.json" }\n');

    const result = auditNoRelativeParentImports(root, { skipTsconfig: true });

    expect(result.ok).toBe(true);
  });

  test("does not descend into node_modules or dist", () => {
    const root = tempRepo();
    mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });
    mkdirSync(join(root, "dist"), { recursive: true });
    writeFileSync(join(root, "node_modules", "pkg", "tsconfig.json"), '{ "extends": "../x" }\n');
    writeFileSync(join(root, "dist", "tsconfig.json"), '{ "extends": "../y" }\n');

    const result = auditNoRelativeParentImports(root);

    expect(result.ok).toBe(true);
  });
});

describe("auditNoLinkProtocol", () => {
  test("flags link: values in dependencies, devDependencies, optionalDependencies", () => {
    const root = tempRepo();
    writeJson(join(root, "package.json"), {
      name: "root",
      dependencies: { "@scope/a": "link:../a" },
      devDependencies: { "@scope/b": "link:./b" },
      optionalDependencies: { "@scope/c": "link:../../c" },
    });

    const result = auditNoLinkProtocol(root);

    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(3);
    expect(result.violations.every((v) => v.file === "package.json")).toBe(true);
    expect(result.violations[0]?.message).toContain("dependencies.@scope/a");
    expect(result.violations[1]?.message).toContain("devDependencies.@scope/b");
    expect(result.violations[2]?.message).toContain("optionalDependencies.@scope/c");
  });

  test("flags link: inside pnpm.overrides", () => {
    const root = tempRepo();
    writeJson(join(root, "package.json"), {
      name: "root",
      pnpm: { overrides: { "@scope/x": "link:../x" } },
    });

    const result = auditNoLinkProtocol(root);

    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.message).toContain("pnpm.overrides.@scope/x");
  });

  test("accepts catalog:, workspace:, file:, and explicit versions", () => {
    const root = tempRepo();
    writeJson(join(root, "package.json"), {
      name: "root",
      dependencies: {
        "@scope/a": "catalog:",
        "@scope/b": "workspace:*",
        "@scope/c": "file:./local-tgz/c.tgz",
        "@scope/d": "^1.2.3",
      },
      pnpm: { overrides: { foo: "8.18.0" } },
    });

    const result = auditNoLinkProtocol(root);

    expect(result.ok).toBe(true);
    expect(result.checked).toBe(1);
  });

  test("discovers workspace package.json files via globs", () => {
    const root = tempRepo();
    mkdirSync(join(root, "packages", "a"), { recursive: true });
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    writeJson(join(root, "package.json"), { name: "root" });
    writeJson(join(root, "packages", "a", "package.json"), {
      name: "@scope/a",
      dependencies: { "@scope/b": "link:../b" },
    });

    const result = auditNoLinkProtocol(root);

    expect(result.ok).toBe(false);
    expect(result.violations[0]?.file).toBe("packages/a/package.json");
  });

  test("returns ok when no package.json exists", () => {
    const root = tempRepo();
    const result = auditNoLinkProtocol(root);
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(0);
  });
});

describe("auditNoRelativePackageScripts", () => {
  function writePackageJson(dir: string, scripts: Record<string, string>): void {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "pkg", scripts }, null, 2));
  }

  test("flags ../  in a script value", () => {
    const root = tempRepo();
    writePackageJson(join(root, "packages", "a"), {
      "build:fix-extensions": "node ../../../scripts/add-js-extensions.js dist",
    });
    const result = auditNoRelativePackageScripts(root);
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.message).toContain("build:fix-extensions");
    expect(result.violations[0]?.message).toContain("relative parent path");
  });

  test("passes when scripts use registered bins or workspace commands", () => {
    const root = tempRepo();
    writePackageJson(join(root, "packages", "a"), {
      build: "pnpm --filter scripts add-js-extensions dist",
      typecheck: "tsc --noEmit",
      lint: "oxlint src",
    });
    const result = auditNoRelativePackageScripts(root);
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  test("catches multiple violations across packages", () => {
    const root = tempRepo();
    writePackageJson(join(root, "packages", "a"), {
      build: "node ../scripts/foo.js",
    });
    writePackageJson(join(root, "packages", "b"), {
      postbuild: "bun ../../scripts/bar.ts",
    });
    const result = auditNoRelativePackageScripts(root);
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(2);
  });

  test("skips node_modules", () => {
    const root = tempRepo();
    writePackageJson(join(root, "node_modules", "some-pkg"), {
      build: "node ../../../anything.js",
    });
    const result = auditNoRelativePackageScripts(root);
    expect(result.ok).toBe(true);
  });

  test("returns ok when no package.json scripts exist", () => {
    const root = tempRepo();
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "root" }));
    const result = auditNoRelativePackageScripts(root);
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(1);
  });

  test("does NOT flag ../ appearing only in an argument position (not the script path)", () => {
    const root = tempRepo();
    writePackageJson(join(root, "packages", "a"), {
      codegen:
        "graphql-codegen --config src/codegen.ts && node scripts/gen.mjs ../../../output/file.ts",
      "build:fix-extensions": "node scripts/add-js-extensions.js ../../../output/dir",
    });
    const result = auditNoRelativePackageScripts(root);
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  test("DOES flag ../ in the script (interpreter + relative path) position", () => {
    const root = tempRepo();
    writePackageJson(join(root, "packages", "a"), {
      "build:fix-extensions": "node ../../../scripts/foo.js dist",
    });
    const result = auditNoRelativePackageScripts(root);
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.message).toContain("build:fix-extensions");
  });
});
