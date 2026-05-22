---
type: research
title: "Codex Official Types and Hook Trust Alignment"
subject: "How agent-kit should align Codex hook trust automation with official Codex types and public repositories"
date: 2026-05-14
last_updated: '2026-05-14'
confidence: medium
verdict: trial
---

# Codex Official Types and Hook Trust Alignment

> Use OpenAI's public Codex repo and app-server protocol as the source of truth; avoid owning Codex's hook hash algorithm except as a compatibility fallback.

## TL;DR

- **Yes, we can use OpenAI's public Codex repositories.** The repo is Apache-2.0 licensed, and it contains Rust protocol structs plus generated TypeScript/JSON-schema surfaces for app-server.
- **Best next implementation:** after writing `.codex/hooks.json`, start `codex app-server`, call `hooks/list`, read each hook's official `key` + `currentHash`, and write `hooks.state` with `config/batchWrite`.
- **Do not make GitHub `main` a runtime dependency.** Generate or vendor a pinned, minimal protocol snapshot and keep runtime behavior against the installed local `codex` binary.
- **Current manual hashing is defensible but fragile.** Local Codex 0.130.0 verification shows our reproduced hashes match app-server, but upstream code marks hook keys as currently positional.
- **Verdict: trial.** The official path is good enough for a bounded migration, but app-server/parts of the protocol are still versioned with experimental surfaces.

## What This Is

This research evaluates whether `@webpresso/agent-kit` should align its Codex hook trust setup with official OpenAI Codex types and public source, especially for auto-trusting installed hooks that otherwise require manual `/hooks` review.

The question is not whether to bypass user safety. The target is: when `agent-kit` installs its own deterministic local hooks, can it use official Codex metadata to persist the same trust state Codex would record after user approval, without duplicating private implementation details?

## State of the Art (2026)

OpenAI's official Codex hooks documentation describes hooks as deterministic scripts during the Codex lifecycle, enabled by config and loaded from user/project config layers such as `~/.codex/hooks.json`, `~/.codex/config.toml`, `<repo>/.codex/hooks.json`, and `<repo>/.codex/config.toml` ([Codex Hooks docs](https://developers.openai.com/codex/hooks)). The docs also note that multiple matching hooks can run and that project-local hooks depend on project trust.

The official app-server documentation positions `codex app-server` as the rich-client protocol Codex uses for integrations, implemented in the open-source Codex repo. It uses JSON-RPC over stdio by default and can generate TypeScript and JSON Schema artifacts for the exact installed Codex version ([Codex App Server docs](https://developers.openai.com/codex/app-server)).

The open-source app-server README documents a `hooks/list` method that returns discovered hooks for one or more working directories. Its hook metadata includes `key`, `currentHash`, `trustStatus`, `enabled`, `sourcePath`, and source classification. The same README documents updating `hooks.state` via `config/batchWrite` ([app-server README](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)).

The public protocol source is typed. `codex-rs/app-server-protocol` derives `serde`, `schemars::JsonSchema`, and `ts_rs::TS` for protocol types, including hook event/source/trust enums ([hook.rs](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/src/protocol/v2/hook.rs)). The `plugin.rs` protocol file defines `HooksListParams`, `HooksListResponse`, `HooksListEntry`, and `HookMetadata`; `HookMetadata` has exactly the fields agent-kit needs: `key`, `sourcePath`, `currentHash`, and `trustStatus` ([plugin.rs](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/src/protocol/v2/plugin.rs)). The generated TS file for `HookMetadata` is also checked into the repo ([generated HookMetadata.ts](https://raw.githubusercontent.com/openai/codex/main/codex-rs/app-server-protocol/schema/typescript/v2/HookMetadata.ts)).

A crate named `codex-app-server-protocol` exists on docs.rs/crates.io, but its package metadata currently points at `namastexlabs/codex`, not `openai/codex`, so it should **not** be treated as an official OpenAI distribution path. The current npm `@openai/codex` package is an official CLI distribution, not a stable TypeScript SDK for importing app-server protocol types ([docs.rs crate](https://docs.rs/crate/codex-app-server-protocol/latest), [npm package](https://www.npmjs.com/package/%40openai/codex)).

## Positive Signals

### Official metadata avoids reverse-engineering

- `hooks/list` returns `currentHash` and `trustStatus`, so agent-kit can ask the installed Codex binary for the canonical trust identity instead of reproducing Codex internals ([app-server README](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)). **Credibility: high, official source.**
- The app-server docs explicitly support generating TypeScript and JSON Schema for the installed Codex version, which fits our TypeScript codebase better than copying Rust logic ([Codex App Server docs](https://developers.openai.com/codex/app-server)). **Credibility: high, official docs.**
- Local verification on Codex CLI 0.130.0 showed app-server `hooks/list` hashes match the manual hashes agent-kit currently computes for our generated hooks. **Credibility: high for current local version, but not future-proof.**

### Public repo is usable under license

- The Codex repo is Apache-2.0 licensed ([LICENSE](https://github.com/openai/codex/blob/main/LICENSE)). That permits reuse/vendoring subject to preserving license/notice requirements. **Credibility: high, official license.**
- The protocol source derives JSON Schema and TypeScript exports, showing OpenAI intends the protocol shape to be machine-consumable, not just prose documentation ([hook.rs](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/src/protocol/v2/hook.rs), [plugin.rs](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/src/protocol/v2/plugin.rs)). **Credibility: high, source code.**

### The config API matches our need

- `config/batchWrite` accepts config edits, supports `mergeStrategy`, defaults to user config when `filePath` is omitted, and can hot-reload user config ([config.rs](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/src/protocol/v2/config.rs)). **Credibility: high, protocol source.**
- The app-server README demonstrates writing `hooks.state` with `config/batchWrite`, so this is closer to an official integration path than hand-editing TOML directly ([app-server README](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)). **Credibility: high, official repo documentation.**

## Negative Signals

### Hook trust API is not a first-class “approve hook” command yet

- There is not yet a dedicated supported method named like `hooks/trust` or `hooks/approve`. The documented path is to list hooks and write `hooks.state`; that is workable but indirect ([app-server README](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)). **Credibility: high, official repo docs.**
- A recent OpenAI Codex issue asks for a supported way for local wrappers/installers to request trust for installed hooks, noting that the practical workaround is writing `[hooks.state]` entries directly ([Issue #21615](https://github.com/openai/codex/issues/21615)). **Credibility: medium, community/maintainer-tracked signal; not an accepted API contract.**

### Key/hash details can change

- Codex source currently computes a command hook hash from a normalized config-derived identity and separately constructs hook keys from source identity plus event/group/handler indexes ([discovery.rs](https://github.com/openai/codex/blob/main/codex-rs/hooks/src/engine/discovery.rs)). **Credibility: high, source code.**
- The same source contains a TODO to replace the positional suffix with a durable hook id, which means persisting keys should always be refreshed from `hooks/list` after writing hooks, not guessed ([discovery.rs](https://github.com/openai/codex/blob/main/codex-rs/hooks/src/engine/discovery.rs)). **Credibility: high, source code.**
- The hash function ultimately canonicalizes TOML-derived JSON and prefixes a SHA-256 digest with `sha256:` ([fingerprint.rs](https://github.com/openai/codex/blob/main/codex-rs/config/src/fingerprint.rs)). That explains why our manual implementation works today, but also why it is a liability to own. **Credibility: high, source code.**

### Type distribution is not ideal for a TS library

- A Rust crate named `codex-app-server-protocol` is published and documented, but fact-checking its crates.io metadata showed `repository: https://github.com/namastexlabs/codex` and version `0.63.0`; do **not** assume it is OpenAI-published or current with `openai/codex` ([docs.rs crate](https://docs.rs/crate/codex-app-server-protocol/latest)). **Credibility: medium package metadata, negative for official-type alignment.**
- The `@openai/codex` npm package is an official CLI distribution (`codex` bin). A fact-check of `@openai/codex@0.130.0` via `npm pack` found only `README.md`, `bin/codex.js`, `bin/rg`, and `package.json`, so importing app-server protocol types from npm is not currently the clean path ([npm package](https://www.npmjs.com/package/%40openai/codex)). **Credibility: high for package contents at 0.130.0.**
- App-server docs mark WebSocket transport as experimental/unsupported; even though stdio is the right local choice for us, the broader protocol surface still has experimental areas ([Codex App Server docs](https://developers.openai.com/codex/app-server)). **Credibility: high, official docs.**

### Hooks themselves are still evolving

- Official hooks docs say `PreToolUse` is a guardrail rather than a complete enforcement boundary and does not intercept all tool paths ([Codex Hooks docs](https://developers.openai.com/codex/hooks)). This does not block our trust-state work, but it matters for how we describe hook guarantees. **Credibility: high, official docs.**
- Recent issues around hook coverage/trust show active churn and user demand for parity and better APIs ([Issue #20204](https://github.com/openai/codex/issues/20204), [Issue #19385](https://github.com/openai/codex/issues/19385), [Issue #21615](https://github.com/openai/codex/issues/21615)). **Credibility: medium, community signal.**

## Community Sentiment

Sentiment is mixed but useful:

- Positive: users and wrapper authors want hooks because they enable lifecycle observability, local policy, approvals, and IDE/wrapper integration. Issues requesting `PermissionRequest`, richer hook coverage, and trust APIs show real integration demand ([Issue #15311](https://github.com/openai/codex/issues/15311), [Issue #16301](https://github.com/openai/codex/issues/16301), [Issue #21615](https://github.com/openai/codex/issues/21615)).
- Negative/cautionary: the same issues show the API is moving. Hook trust, coverage, and desktop/CLI behavior have recently changed enough that integrators are hitting review walls or inconsistent behavior ([Issue #21639](https://github.com/openai/codex/issues/21639), [Issue #20204](https://github.com/openai/codex/issues/20204)).

Balance: favorable toward using hooks and app-server, but cautious about treating undocumented internals as stable.

## Project Alignment

### Vision Fit

Agent-kit's VISION.md emphasizes “One command, fully wired,” where `wp setup` makes a bare checkout ready for AI coding agents with context, hooks, and guardrails. It also says the catalog is law, surfaces should load at the right time, and failures should be loud rather than silent.

Using official app-server hook metadata supports that vision better than manual hashing:

- **One command, fully wired:** `wp setup` can install hooks and persist the correct trust state automatically.
- **Surfaces load at the right time:** app-server evaluates the effective config for the actual cwd, including user/project/plugin layers.
- **Fail loudly:** if app-server cannot provide `currentHash`, agent-kit can emit a precise warning and fall back to manual hashing only under known-compatible Codex versions.

### Tech Stack Fit

Agent-kit is a strict TypeScript ESM repo using Bun/Node CLIs, `zod`, `yaml`, and generated command binaries. It currently has no OpenAI/Codex SDK dependency. This favors a small local protocol client over adding a large or unstable dependency.

Recommended fit:

1. Add a tiny JSONL stdio client around `codex app-server`.
2. Generate or vendor minimal protocol types for `initialize`, `hooks/list`, and `config/batchWrite`.
3. Validate runtime responses with `zod` at the boundary because protocol artifacts can be generated from a different Codex version than the installed local binary.
4. Keep current TOML writer as a fallback path, not the default source of truth.

### Trade-offs for Current Stage

- **Reliability vs. simplicity:** spawning app-server is more code than computing hashes, but it aligns with Codex's own view of hook identity.
- **Official-but-indirect vs. internal clone:** `hooks/list` + `config/batchWrite` is indirect, but still more official than duplicating `command_hook_hash` and `version_for_toml`.
- **Pinned types vs. latest repo:** pinning generated types reduces surprise; depending on GitHub `main` would violate our “fail loudly” and reproducibility principles.

## Recommendation

**Verdict: trial, confidence medium.**

Implement a bounded migration from manual hook hashing to app-server-derived hook trust.

### Recommended design

1. **After writing Codex hook definitions**, spawn local `codex app-server --listen stdio://`.
2. Send `initialize` with `clientInfo.name = "webpresso_agent_kit"`, then `initialized`.
3. Call `hooks/list` with the repo cwd(s).
4. Filter discovered hooks by:
   - `sourcePath` matching the hook file/config layer agent-kit wrote, and
   - `command` matching known `wp-*` generated hook commands, and
   - `isManaged === false`.
5. Build a state update:
   ```json
   {
     "<hook.key>": {
       "enabled": true,
       "trusted_hash": "<hook.currentHash>"
     }
   }
   ```
6. Call `config/batchWrite` with `keyPath: "hooks.state"`, `mergeStrategy: "upsert"`, and `reloadUserConfig: true`; Codex config source defines hook state with `enabled` and `trusted_hash` fields ([hook_config.rs](https://github.com/openai/codex/blob/main/codex-rs/config/src/hook_config.rs)).
7. Re-run `hooks/list` and assert target hooks are `trusted` and enabled.
8. If app-server is unavailable, fall back to the current manual hash path only for known-compatible Codex versions, with a warning that official app-server trust sync failed.

### Type strategy

- Use `codex app-server generate-ts --out <temp>` in a dev/test script to capture current official types.
- Vendor a minimal pinned subset under an explicit path such as `src/vendor/codex-app-server-protocol/v2/` with source URL, Codex version/commit, and Apache-2.0 notice.
- Prefer runtime `zod` schemas for the small subset we consume (`HookMetadata`, `HooksListResponse`, `ConfigBatchWriteParams`) so mismatches fail clearly.
- Do not import from `@openai/codex` as a TypeScript SDK unless OpenAI publishes a stable app-server protocol package.

### Conditions that would change this recommendation

- **Adopt:** OpenAI adds a first-class `hooks/trust`/`hooks/approve` method or publishes a stable TS protocol SDK.
- **Hold:** app-server removes or gates `hooks/list`/`config/batchWrite` in a way that prevents local setup tools from updating user hook state.
- **Reject manual fallback:** upstream changes hook hashing/keying again and our fallback cannot be proven with contract tests.


## Fact-check Addendum (2026-05-14)

After re-checking the report, one claim needed correction:

- **Corrected:** The report originally implied OpenAI publishes the Rust `codex-app-server-protocol` crate. Current crates.io metadata for `codex-app-server-protocol` reports repository `https://github.com/namastexlabs/codex` and max version `0.63.0`, so agent-kit should not rely on that crate as an official OpenAI type source.
- **Confirmed:** `codex app-server generate-ts --out DIR` and `codex app-server generate-json-schema --out DIR` exist in local Codex CLI 0.130.0 and are marked experimental; generated artifacts are therefore the best local official type snapshot.
- **Confirmed:** `@openai/codex@0.130.0` is the official CLI npm package, but its tarball does not include app-server protocol TypeScript declarations.

## Product Directive Addendum (2026-05-14)

After the blueprint refinement, the implementation target changed from “app-server first with manual hash fallback” to **app-server-only trust sync with no local Codex hash mirroring**. The manual hash path was useful as a discovery bridge, but it should not remain in production code: if `codex app-server` cannot provide official hook metadata, agent-kit should emit an actionable diagnostic and leave hooks reviewable through `/hooks` rather than writing guessed `trusted_hash` values.

## Sources

1. [Codex Hooks docs](https://developers.openai.com/codex/hooks) — official docs, high credibility, positive/cautionary.
2. [Codex App Server docs](https://developers.openai.com/codex/app-server) — official docs, high credibility, positive/cautionary.
3. [OpenAI Codex app-server README](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md) — official repo docs, high credibility, positive.
4. [Codex hook discovery source](https://github.com/openai/codex/blob/main/codex-rs/hooks/src/engine/discovery.rs) — official source, high credibility, cautionary.
5. [Codex config fingerprint source](https://github.com/openai/codex/blob/main/codex-rs/config/src/fingerprint.rs) — official source, high credibility, cautionary.
6. [App-server hook protocol types](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/src/protocol/v2/hook.rs) — official source, high credibility, positive.
7. [App-server hooks/list protocol types](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/src/protocol/v2/plugin.rs) — official source, high credibility, positive.
8. [App-server config write protocol types](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/src/protocol/v2/config.rs) — official source, high credibility, positive.
9. [Generated HookMetadata TypeScript](https://raw.githubusercontent.com/openai/codex/main/codex-rs/app-server-protocol/schema/typescript/v2/HookMetadata.ts) — official generated source, high credibility, positive.
10. [OpenAI Codex LICENSE](https://github.com/openai/codex/blob/main/LICENSE) — official license, high credibility, positive.
11. [codex-app-server-protocol on docs.rs](https://docs.rs/crate/codex-app-server-protocol/latest) — package metadata, medium credibility; fact-check indicates this should not be treated as official OpenAI distribution.
12. [@openai/codex on npm](https://www.npmjs.com/package/%40openai/codex) — package metadata, medium credibility, cautionary.
13. [Issue #21615: supported hook trust request](https://github.com/openai/codex/issues/21615) — community/issue tracker, medium credibility, cautionary.
14. [Issue #20204: PreToolUse hook coverage](https://github.com/openai/codex/issues/20204) — community/issue tracker, medium credibility, cautionary.
15. [Issue #19385: hook parity/additionalContext](https://github.com/openai/codex/issues/19385) — community/issue tracker, medium credibility, cautionary.
16. [Issue #15311: blocking PermissionRequest hook](https://github.com/openai/codex/issues/15311) — community/issue tracker, medium credibility, positive demand signal.
17. [Codex hook config source](https://github.com/openai/codex/blob/main/codex-rs/config/src/hook_config.rs) — official source, high credibility, positive for `trusted_hash` field shape.
