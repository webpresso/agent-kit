# Review ledger — blueprint-pr-governance

Committed second-brain record of every review round (approvals AND rejections).
Machine-gate truth lives in `_overview.md` frontmatter `approvals:`; this is the
human-readable history + the rejection reasoning worth keeping.

| Date | Reviewer | Rev | Verdict | Note |
| --- | --- | --- | --- | --- |
| 2026-06-27 | codex | 1 | REJECT | overclaimed enforcement; wrong branch convention (`blueprint/<slug>` vs actual `bp/<slug>`); auto-merge unsafe; 100%-prevent impossible |
| 2026-06-27 | deepseek | 1 | NO-VERDICT | `opencode --dir` agentic run timed out at 420s (captured as a routing signal) |
| 2026-06-27 | codex | 2 | REJECT | approval enforcement still underspecified (reviewer-identity left open; PR approval source unspecified) |
| 2026-06-27 | deepseek | 2 | APPROVE | all rejection points addressed; open question "honest, not a blocker" |
| 2026-06-27 | codex | 3 | REJECT | internal contradiction: Task 2.2 said markdown-`## Approvals` gate + stale `gstack` refs vs frontmatter/`.webpresso` source of truth |
| 2026-06-27 | deepseek | 3 | APPROVE | — |
| 2026-06-27 | codex | final | APPROVE | gate internally consistent + implementable (minor Task 1.1 wording nit, fixed) |

**Outcome:** ≥2 distinct approvals (codex + deepseek) on the final rev → promoted draft→planned.
**Routing signal for the scoreboard (Piece 7):** codex caught every real design flaw across 3 rounds (high precision on feasibility); deepseek was lenient + timed out under `--dir`. For blueprint-feasibility review, prefer codex; run deepseek without `--dir`.
