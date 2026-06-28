---
type: blueprint
title: optional agent tool management in wp
status: planned
complexity: M
owner: ozby
created: "2026-06-28"
last_updated: "2026-06-28"
progress: "0% (0/5 tasks done, 0 blocked, updated 2026-06-28)"
tags:
  - cli
  - setup
  - docs
  - verification
---

# Optional agent tool management in WP

## Product wedge anchor

- **Stage outcome:** Codex, Claude Code, OpenCode, OMX, and OMC remain optional and not default-installed while becoming first-class WP-managed add-ons when users explicitly opt in.
- **Consuming surface:** `wp install/remove ...`, `wp update`, `wp setup --with ...`, hook visibility diagnostics, blueprint diagnostics, docs, instruction templates, and verification skill guidance.
- **New user-visible capability:** Canonical opt-in commands for Oh My tools plus base CLIs: `wp install oh-my codex|claude-code [--scope user|project]`, `wp install codex|claude-code|opencode`, and matching non-destructive `wp remove ...` ownership removal. A hook visibility command shows active hooks by folder/source and whether they are project or user/system-wide.

## Summary

Add a narrow optional-tool adapter path for `codex`, `claude`, `opencode`, `omx`, and `omc` that supports explicit install/adoption, update only when WP owns the requested scope, and non-destructive ownership removal. Keep the implementation small: an adapter registry for these tools, a package-manager namespace carve-out for `oh-my`, direct base-CLI install/remove aliases, setup compatibility delegation, hook visibility reporting, and aligned docs/help/instructions/tests.

## Scope

- Add minimal adapters for internal ids `codex`, `claude`, `opencode`, `omx`, and `omc`; Oh My public names stay `codex` and `claude-code` under the `oh-my` namespace, while base CLIs use `codex`, `claude-code`, and `opencode`.
- Intercept only `wp install oh-my ...` and `wp remove oh-my ...`; all other install/add/remove package-manager flows remain routed through VP.
- Preserve persisted state ids (`integrations.omx|omc`, `tooling-ownership.json` ids `omx|omc`).
- Keep `wp setup --with omx|omc` as compatibility, delegating to the same adapter path and nudging users toward canonical commands.
- Update docs/help/instruction/skill surfaces and tests together.
- Extend the canonical verify skill contract for command/setup/update/operator-guidance changes.

## Out of scope

- Generic plugin/tool lifecycle framework.
- Destructive native uninstall for v1 removal.
- Version pinning or drift-repair subsystem for native updater changes.

## Tasks

#### Task 1.1: Adapter registry and ownership semantics

**Status:** todo
**Wave:** 0

Implement a small internal registry for base CLIs (`codex`, `claude`, `opencode`) and Oh My tools (`omx`, `omc`) with canonical public names, aliases, supported scopes, install/ensure/update, ownership claim/unclaim, and status/help copy. Install/adopt claims only the requested scope; removal unclaims only the requested scope and leaves native installs untouched.

**Acceptance:**

- [ ] `wp install oh-my codex|claude-code [--scope user|project]` and `wp install codex|claude-code|opencode` ensure and claim only the requested scope.
- [ ] Matching `wp remove ...` commands clear WP ownership only and print upstream uninstall guidance.
- [ ] Foreign-scope installs are not silently claimed.

#### Task 1.2: CLI routing carve-out and compatibility hints

**Status:** todo
**Wave:** 0

Intercept only the `oh-my` namespace and explicit base CLI tool names under install/remove, accept compatibility aliases only in their intended namespaces, and make misdirected invocations fail with canonical hints. Keep all dependency/package-manager flows unchanged.

**Acceptance:**

- [ ] `wp install omx` / `wp install oh-my-codex` produce corrective hints.
- [ ] Non-tool install/add/remove flows still proxy through VP.
- [ ] `wp setup --with omx|omc` delegates to the adapter path and emits a nudge to `wp install oh-my ...`.

#### Task 1.3: Update flow and blueprint guidance

**Status:** todo
**Wave:** 0

Ensure `wp update` refreshes base CLIs and OMX/OMC only when WP owns that scope; native unowned installs are not auto-adopted. Update blueprint exec missing-OMX diagnostics to recommend `wp install oh-my codex` first with upstream manual install as fallback.

**Acceptance:**

- [ ] Tests prove owned base/Oh My installs update and unowned native installs do not auto-adopt.
- [ ] Blueprint exec diagnostics use the new canonical guidance.

#### Task 1.4: Hook visibility, docs, help, templates, and skill text

**Status:** todo
**Wave:** 0

Add hook visibility reporting that clearly lists active hook folders/sources for project (including git path) and user/system-wide paths. Refresh CLI/package-manager/help text, `docs/add-ons.md`, setup/init output strings, `catalog/AGENTS.md.tpl`, generated instruction wording derived from it, skill/docs catalog surfaces, and snapshots that assert old self-managed-only wording.

**Acceptance:**

- [ ] User-facing command/help/docs/instruction surfaces agree on optional WP-managed base CLI and Oh My behavior plus hook visibility.
- [ ] Generated/catalog surfaces remain package-safe.

#### Task 1.5: Verify skill contract and gates

**Status:** todo
**Wave:** 0

Update the canonical verify skill source so command/setup/update/operator-guidance changes require docs/help/instruction drift verification, including CLI help, docs/guides, generated instruction templates, and skill/catalog references. Verification reports must state refreshed docs/help surfaces and include package-surface leak checks when catalog assets or generated instructions changed.

**Acceptance:**

- [ ] Verify skill/source tests cover the new contract.
- [ ] Focused tests plus typecheck/lint/package-surface checks run or blocked gaps are documented.
