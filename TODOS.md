# TODOs

Durable items that don't justify their own blueprint right now. Promote to a blueprint under `blueprints/draft/` when one of them blocks active work.

---

## 1. Audit `_sandbox/` ignore as a default in `ak audit *` repo guardrails

**What:** Add `_sandbox/` to the default exclude set across every `ak audit` repo guardrail (catalog-drift, blueprint-lifecycle, docs-frontmatter, no-relative-parent-imports, etc.).

**Why:** `_sandbox/` is the user's scratch/archive space (per `~/repos/CLAUDE.md`). Today, `ak audit *` doesn't know that — so repo-wide audits in workspace meta-repo (`/Users/ozby/repos`) surface false positives from stale insul/medtech/mymee dirty trees. Promoting the rule from session-memory feedback (`feedback_ignore_sandbox.md`) to the agent-kit audit defaults benefits every consumer that adopts the same workspace pattern.

**Pros:**
- Consistent default across agent-kit consumers.
- Removes a recurring "ignore sandbox" instruction from session memory.
- Easy to override per-repo via `.agent-kitrc.json`.

**Cons:**
- Slightly opinionated default (assumes `_sandbox/` is sacred).
- Consumers without `_sandbox/` see no behavior change (silent default).

**Context:**
The current implementation excludes `node_modules`, `.git`, generated/, dist/, and several others. `_sandbox/` is a workspace-level convention, not a per-repo one — adding it to defaults is low-risk.

**Depends on / blocked by:** Nothing. Could be a small follow-up PR (one config addition + a test).

