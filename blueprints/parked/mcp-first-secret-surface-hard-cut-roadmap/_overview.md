---
type: parent-roadmap
title: MCP-first secret-surface hard cut roadmap
status: parked
owner: agent-kit
complexity: M
created: '2026-05-26'
last_updated: '2026-05-29'
progress: 'Local agent-kit child is complete; remaining work is documentary cross-repo adoption in framework, monorepo, and ingest-lens, so this roadmap is parked locally pending external execution'
depends_on: []
tags:
  - mcp
  - secrets
  - roadmap
  - cross-repo
  - ci
---

# MCP-first secret-surface hard cut roadmap

## Product wedge anchor

Webpresso already ships the core MCP and secret-management surfaces, but the
remaining ecosystem work is fragmented across repos and stale blueprints. This
roadmap makes the finish line explicit: keep `wp_*` as the canonical agent
surface, remove the remaining public secret legacy, and finish first-party plus
consumer adoption without inventing a second MCP or secret-manager stack.

## Summary

This roadmap is intentionally split between:

- **local auditable child work in `agent-kit`**, which can participate in
  `wp audit roadmap-links`, and
- **documentary cross-repo adoption lanes** in `framework`, `monorepo`, and
  `ingest-lens`, which must stay aligned through body-level cross-plan
  references because the current roadmap audit is local-repo only.

Verified constraints on 2026-05-26:

| ID | Severity | Finding | Effect on roadmap shape |
| --- | --- | --- | --- |
| F1 | HIGH | `type: parent-roadmap` is the correct umbrella artifact for strategic grouping. | The umbrella lives here as a roadmap, not as an executable blueprint. |
| F2 | HIGH | `wp audit roadmap-links` only resolves children from the local repo `blueprints/` tree. | Cross-repo children are documentary references, not auditable parent/child links. |
| F3 | HIGH | `wp_ci_act`, `wp_worker_tail`, `wp config secrets ...`, and the `wp_*` verification tools already exist. | Remaining work is completion, deletion, and adoption — not a fresh MCP build. |
| F4 | HIGH | Public framework runtime still carries `.webpresso/dev.json`, `secrets-setup`, and provider-runner legacy. | Framework needs its own executable cleanup child before downstream adoption can fully settle. |

## Key decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Umbrella artifact | Local `type: parent-roadmap` in `agent-kit` | Matches current blueprint conventions and local roadmap audit support. |
| Cross-repo linkage | Documentary references outside `agent-kit` | Current audit implementation cannot validate external children. |
| Canonical agent surface | `wp_*` MCP tools plus `wp config secrets ...` and `with-secrets -- <cmd>` | Matches the currently shipped surface. |
| Unrelated scope | Split blueprint-authoring hardening into a separate archived historical blueprint | Keeps the CI/tail/secret roadmap executable and narrow without implying that the split-out placeholder is still a live local lane. |

## Quick Reference (Execution Waves)

| Wave | Blueprints | Dependencies |
| --- | --- | --- |
| **Wave 0** | `completed/secret-aware-worker-tail-mcp` | Documentary upstream dependency on the framework “public secret surface hard cut” blueprint |

## Cross-plan references

| Blueprint | Relationship | Required alignment |
| --- | --- | --- |
| [`webpresso/framework — public-secret-surface-hard-cut`](https://github.com/webpresso/framework/tree/main/blueprints/completed) | Documentary upstream dependency | Must remove public secret-selection legacy; completed lane defines the hard-cut contract consumed downstream. |
| [`webpresso/monorepo — secret-aware-ci-act-helper-adoption`](https://github.com/webpresso/monorepo/tree/main/webpresso/blueprints/planned) | Documentary first-party adopter | Must adopt the stabilized public CI/tail/helper contract instead of source-path wrappers. |
| [`ozby/ingest-lens — public-ci-surface-adoption`](https://github.com/ozby/ingest-lens/tree/main/blueprints/planned) | Documentary external consumer adopter | Must reflect `act-with-webpresso`, `wp_*`, and `with-secrets -- <cmd>` as the real current baseline. |
| [`webpresso/agent-kit — blueprint-authoring-surface-hardening`](https://github.com/webpresso/agent-kit/tree/main/blueprints/archived/blueprint-authoring-surface-hardening) | Historical sibling blueprint | Preserves the split-out blueprint-authoring history and remains outside this roadmap’s executable scope. |

## Validation notes

- `wp audit roadmap-links` can only validate the local `completed/secret-aware-worker-tail-mcp`
  backlink in this repo.
- Cross-repo consistency must be checked by validating each child blueprint and
  keeping the cross-plan reference tables synchronized.

## Tasks

#### Task 1.1: Track cross-repo adoption without reopening a local executable lane

**Status:** todo

**Wave:** 0

**Files:**
- Documentary cross-plan references only

**Acceptance:**
- [ ] The roadmap remains parked locally until a new agent-kit-owned execution lane actually appears.
- [ ] Cross-repo references stay aligned with the canonical `wp_*` and secret-surface contract.
