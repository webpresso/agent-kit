---
type: research
title: "Blueprint Platform Sync — Is a Private Platform API the Right Architecture?"
subject: "Local-first SQLite vs platform-canonical sync for agent-kit blueprint state"
date: 2026-05-12
last_updated: "2026-05-12"
confidence: high
verdict: hold
---

# Blueprint Platform Sync — Architecture Review

> The 2026 local-first consensus runs counter to the blueprint's platform-canonical design. Lighter-weight alternatives (git, Turso, Litestream) solve the product wedge without a proprietary API dependency.

## TL;DR

- **What the blueprint proposes:** Make a private webpresso platform API the canonical store for blueprint state; agent-kit syncs up/down, markdown becomes a derived artifact.
- **What the research shows:** This inverts the 2026 local-first consensus. The dominant 2026 pattern is local-first (device is canonical) + optional cloud sync — which is what agent-kit already has.
- **The product wedge** ("two machines, no conflicts") is already solved by git for the markdown layer, and by Turso embedded replicas or Litestream for the SQLite layer — without building a proprietary API.
- **Recommendation:** Hold the current blueprint. Evaluate Option A (git is enough) or Option B (Turso embedded replicas) instead.

## What This Is

`blueprint-platform-sync` proposes making the private webpresso platform API the **canonical store** for blueprint state. agent-kit's local SQLite would become a read-only replica; mutations go through the platform API; markdown files would be auto-generated from the canonical database.

The 13 tasks and 7 open design questions (Q1–Q7) are all predicated on this architecture choice.

## State of the Art (2026)

### Local-first is the dominant pattern

The 2026 consensus from [Ink & Switch](https://www.inkandswitch.com/essay/local-first/), [Smashing Magazine](https://www.smashingmagazine.com/2026/05/architecture-local-first-web-development/), and [PowerSync](https://www.powersync.com/blog/local-first-key-concepts-developer-benefits-of-local-first): **the device holds the authoritative working copy; cloud sync is optional and additive.** Platform-canonical is the opposite of this.

### SQLite sync is mature and simple

Three production-ready options exist without building a proprietary API:

| Tool                                                          | Model                               | Complexity      | Agent-kit fit |
| ------------------------------------------------------------- | ----------------------------------- | --------------- | ------------- |
| **git**                                                       | markdown files as source of truth   | near-zero       | already works |
| **[Turso embedded replicas](https://turso.tech/local-first)** | embedded SQLite + cloud primary     | 1-2 days        | excellent     |
| **[Litestream](https://litestream.io/)**                      | SQLite streaming replication to S3  | 1 day           | excellent     |
| **[PowerSync](https://powersync.com/)**                       | CRDT-based sync for SQLite          | 3-5 days        | good          |
| **Platform API (current blueprint)**                          | proprietary, requires platform team | 14 tasks, weeks | overkill      |

### AI agent state persistence patterns

[LangGraph](https://www.langchain.com/blog/agentic-engineering-redefining-software-engineering) and every major 2026 agent framework use **local SQLite for checkpointing** — not a platform-canonical API. The pattern: checkpoint to local SQLite, sync if needed, never make the cloud canonical.

From [Indium Tech's 2026 state persistence guide](https://www.indium.tech/blog/7-state-persistence-strategies-ai-agents-2026/): "checkpointing, hybrid memory layers, graph-based state passing — all stored in local durable stores, not remote-canonical APIs."

## Positive Signals (for platform sync)

### Real-time cross-machine collaboration

If two humans (not AI agents) need to collaborate on the same blueprint in real time — editing task statuses simultaneously — a platform-canonical approach with conflict resolution does solve this better than git.

**Source:** [Electric SQL / agents-on-sync](https://electric.ax/) — production-grade for this use case.

### Platform template catalog

Q5 (serving templates from the platform catalog) is a legitimate use case. A central template API is genuinely useful for distributing curated blueprints across teams.

**But:** This can be solved with a read-only CDN endpoint or GitHub releases — no write-sync required.

### Audit trail / history

A platform-canonical store provides a durable history that survives local machine loss. Valuable for compliance-conscious teams.

**But:** git already provides this for the markdown layer.

## Negative Signals

### Goes against the 2026 local-first trend

[Smashing Magazine](https://www.smashingmagazine.com/2026/05/architecture-local-first-web-development/): "local-first apps have super-fast UI because they use a local database with near-zero latency." Making platform canonical eliminates this. agent-kit's MCP tools (sub-ms query time today) would add network latency.

### Requires platform team and creates lock-in

Q6 (monorepo boundary) is unresolved precisely because this architecture requires changes to the private webpresso platform-api. That's a coordination dependency, external to agent-kit's open-source development cycle. Every user of agent-kit becomes dependent on webpresso's platform availability.

### Agent-kit is already local-first and correct

The current architecture: **markdown = canonical, SQLite = fast projection**. This IS the correct local-first pattern. `blueprint-platform-sync` proposes solving a problem the current architecture doesn't actually have.

### Q1-Q7 are hard because the architecture is over-engineered

The seven open questions (offline mutation strategy, auth model, freshness SLA, markdown generation ownership, template catalog model, monorepo boundary, migration) exist because the proposed architecture is complex. Simpler approaches (Turso, git) don't have Q1-Q7.

**From [Sachith Dassanayake's 2026 offline sync guide](https://www.sachith.co.uk/offline-sync-conflict-resolution-patterns-crash-course-practical-guide-apr-8-2026/):** "The best architecture is the one your team can debug at 2 AM. If you're adding sync because it sounds cool and you don't fully understand the failure modes yet, build a prototype first."

## Community Sentiment

From [Hacker News discussion on ElectricSQL](https://news.ycombinator.com/item?id=37584049): "Local-first is great but only if local IS canonical. The moment you make the server canonical and local a replica, you've just built a bad API client, not a local-first app."

From [DEV Community on SQLite in 2026](https://dev.to/pockit_tools/the-sqlite-renaissance-why-the-worlds-most-deployed-database-is-taking-over-production-in-2026-3jcc): "For new projects, Turso or D1 are safer bets for managed replication" — managed replication, not custom platform APIs.

Sentiment is **strongly against platform-canonical** for developer tools that are also open-source. The recommendation is consistently: local-first + optional sync overlay, not canonical inversion.

## Project Alignment

### Vision Fit

The product wedge: "Two agents on different machines collaborating on the same blueprint never conflict."

**Current state:** This is ALREADY solved by git. When agents work on the same blueprint across machines, they run on the same git repo. `git push` after `wp blueprint task done` — same as any code change. The "conflict" scenario requires two agents mutating the same task simultaneously on disconnected machines, which is not the primary use case for solo developers using agent-kit.

If the use case is real (two humans, not two AI agents, collaborating in real time), that's a different product — closer to a collaborative project management tool, which is a significant scope expansion.

### Tech Stack Fit

agent-kit already uses better-sqlite3 and has a proven SQLite schema. Turso's embedded replica model is a drop-in: same better-sqlite3 API, replication happens transparently. Integration cost: low.

### Trade-offs for Current Stage

agent-kit is at v0.15 targeting v1.0 alpha. The blueprint-platform-sync blueprint has a HIGH-severity risk: "Platform API not yet built." This means 14 tasks of agent-kit work depend on an external team building a platform API first. This is a blocking dependency that has no timeline.

## Recommendation

**Hold the `blueprint-platform-sync` blueprint in `planned/`.**

The product wedge is real but over-served by the proposed solution. Three alternatives achieve the cross-machine sync goal at a fraction of the complexity:

### Option A: Git is enough (0 new tasks)

Blueprint markdown files are already in git. Cross-machine sync = `git push/pull`. Works today. The only gap: SQLite replica doesn't sync automatically — but it cold-starts from markdown in seconds via `ingestAll()`.

**Covers:** Q1 (offline = no network = git, push when reconnected), Q7 (existing blueprints already in git), Q6 (no platform API boundary).

### Option B: Turso embedded replicas (S, 1-2 days)

Add Turso as an optional sync backend. When `TURSO_URL` env var is set, agent-kit uses an embedded Turso replica instead of plain SQLite. Each machine reads locally; writes replicate to Turso primary. No new API to build.

**Covers:** Q1-Q3 natively. Doesn't require platform team. Open-source friendly. Solves the "real-time cross-machine" use case without a proprietary API.

### Option C: Template catalog only (XS, 1 task)

The one genuinely new capability in the blueprint that can't be solved by git is Q5 (platform template catalog). Implement `wp blueprint new --fetch-template <url>` that reads from a GitHub release or CDN URL. No platform API, no sync complexity.

**Ask the user** which option to pursue — or whether the blueprint should stay parked indefinitely.

## Sources

1. [PowerSync — local-first developer benefits](https://www.powersync.com/blog/local-first-key-concepts-developer-benefits-of-local-first) — official docs, high credibility, positive on local-first
2. [sqlite-sync CRDT-based sync](https://github.com/sqliteai/sqlite-sync) — GitHub, high credibility, positive
3. [Distributed SQLite: LibSQL and Turso 2026](https://dev.to/dataformathumb/distributed-sqlite-why-libsql-and-turso-are-the-new-standard-in-2026-58fk) — DEV Community blog, medium credibility, positive
4. [Smashing Magazine: Local-first web architecture 2026](https://www.smashingmagazine.com/2026/05/architecture-local-first-web-development/) — respected engineering publication, high credibility, positive for local-first / negative for platform-canonical
5. [Ink & Switch: Local-first software](https://www.inkandswitch.com/essay/local-first/) — seminal research paper, high credibility, canonical definition
6. [Offline sync conflict patterns 2026](https://www.sachith.co.uk/offline-sync-conflict-resolution-patterns-crash-course-practical-guide-apr-8-2026/) — technical guide, medium credibility, balanced
7. [ElectricSQL HN discussion](https://news.ycombinator.com/item?id=37584049) — community forum, medium credibility, mixed sentiment
8. [7 state persistence strategies for AI agents 2026](https://www.indium.tech/blog/7-state-persistence-strategies-ai-agents-2026/) — industry blog, medium credibility, neutral/positive for local checkpointing
9. [LangGraph agentic engineering](https://www.langchain.com/blog/agentic-engineering-redefining-software-engineering) — vendor blog (LangChain), medium credibility (note bias), positive on SQLite checkpointing
10. [Turso local-first docs](https://turso.tech/local-first) — official docs, high credibility, positive
11. [SQLite renaissance 2026](https://dev.to/pockit_tools/the-sqlite-renaissance-why-the-worlds-most-deployed-database-is-taking-over-production-in-2026-3jcc) — DEV Community, medium credibility, positive on managed replication
12. [Cross-surface session sync (Codex)](https://codex.danielvaughan.com/2026/04/08/cross-surface-session-sync/) — practitioner blog, medium credibility, positive on local-first session state
