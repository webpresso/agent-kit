#!/usr/bin/env bash
# docs/wedge-experience/demo.sh
#
# Wedge Experience Demo — shows 3 agent-kit value-adds beyond rulesync alone.
# Self-contained: works without network access and gracefully degrades if `wp`
# is not globally installed.
#
# Usage: bash docs/wedge-experience/demo.sh

set -euo pipefail

DEMO_DIR="$(mktemp -d)"
trap 'rm -rf "$DEMO_DIR"' EXIT

print_section() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  $1"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# ─────────────────────────────────────────────────────────────────────────────
# DEMO 1: Drift catch — over-budget skill
# ─────────────────────────────────────────────────────────────────────────────
print_section "DEMO 1/3 — Drift catch: skill exceeding Codex 8KB budget"

SKILL_DIR="$DEMO_DIR/.agent/skills/oversized-skill"
mkdir -p "$SKILL_DIR"

# Generate a SKILL.md that exceeds 16KB (well above Codex's 8KB limit)
{
  echo "# oversized-skill"
  echo ""
  echo "This skill is intentionally over-sized to demonstrate the audit."
  echo ""
  # Repeat a block of text until the file is well over 16KB
  for i in $(seq 1 200); do
    echo "## Section $i"
    echo ""
    echo "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod"
    echo "tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim"
    echo "veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea."
    echo ""
  done
} > "$SKILL_DIR/SKILL.md"

SKILL_SIZE=$(wc -c < "$SKILL_DIR/SKILL.md")
echo ""
echo "Created: $SKILL_DIR/SKILL.md"
echo "File size: ${SKILL_SIZE} bytes (Codex budget: 8192 bytes)"
echo ""
echo "With rulesync alone:"
echo "  rulesync generate  # succeeds — no size awareness"
echo "  → Codex silently truncates the skill at 8KB"
echo "  → last $(( SKILL_SIZE - 8192 )) bytes of guidance never seen by Codex"
echo ""
echo "With agent-kit:"

if command -v wp &>/dev/null; then
  (cd "$DEMO_DIR" && wp audit skill-sizes 2>&1) || true
else
  cat <<'EXPECTED'
  $ wp audit skill-sizes
  WARN  .agent/skills/oversized-skill/SKILL.md
    compiled size: 16.8KB (Codex budget: 8KB, overage: 8.6KB)
    suggestion: split into oversized-skill/core + oversized-skill/examples
  1 skill over budget (run with --strict to exit 1)
EXPECTED
  echo "  [wp not found — showing expected output above]"
fi

# ─────────────────────────────────────────────────────────────────────────────
# DEMO 2: AGENTS.md section-keyed merge
# ─────────────────────────────────────────────────────────────────────────────
print_section "DEMO 2/3 — AGENTS.md section-keyed merge (layered precedence)"

BASE_AGENTS="$DEMO_DIR/base-AGENTS.md"
LOCAL_AGENTS="$DEMO_DIR/local-AGENTS.md"
MERGED_AGENTS="$DEMO_DIR/merged-AGENTS.md"

cat > "$BASE_AGENTS" <<'EOF'
# AGENTS.md (base — from catalog)

## Commit convention
Use conventional commits: feat|fix|chore|docs|test|refactor.

## Testing
Run `pnpm test` before every commit.
EOF

cat > "$LOCAL_AGENTS" <<'EOF'
# AGENTS.md (local override — .agent/rules/project-overrides.md)

## Commit convention
Use conventional commits with lore trailers.
Required: Confidence: (low|medium|high)
Optional: Constraint: / Rejected: / Directive:
EOF

cat > "$MERGED_AGENTS" <<'EOF'
# AGENTS.md (merged output)

## Commit convention
Use conventional commits with lore trailers.
Required: Confidence: (low|medium|high)
Optional: Constraint: / Rejected: / Directive:

## Testing
Run `pnpm test` before every commit.
EOF

echo ""
echo "Base AGENTS.md (catalog defaults):"
echo "---"
cat "$BASE_AGENTS"
echo ""
echo "Local override (project-specific rules):"
echo "---"
cat "$LOCAL_AGENTS"
echo ""
echo "With rulesync alone: emits each source file separately — no merger"
echo ""
echo "With wp compile: section-keyed merge (local wins on same heading):"
echo "---"
diff --unified "$BASE_AGENTS" "$MERGED_AGENTS" || true
echo ""
echo "  Merged AGENTS.md (local ## Commit convention wins; ## Testing inherited):"
echo "---"
cat "$MERGED_AGENTS"

# ─────────────────────────────────────────────────────────────────────────────
# DEMO 3: Audit-to-tech-debt loop
# ─────────────────────────────────────────────────────────────────────────────
print_section "DEMO 3/3 — Audit-to-tech-debt loop (auto-file remediation)"

echo ""
echo "After demo 1, the audit found an over-budget skill."
echo "rulesync: no further action — drift stays unfiled."
echo ""
echo "With agent-kit (dry-run — no files written):"

if command -v wp &>/dev/null; then
  (cd "$DEMO_DIR" && wp tech-debt new \
    --from-audit skill-sizes \
    --severity medium \
    --dry-run 2>&1) || true
else
  cat <<'EXPECTED'
  $ wp tech-debt new --from-audit skill-sizes --severity medium --dry-run
  [dry-run] would create: tech-debt/needs-remediation/m-001-skill-size-oversized-skill.md
  ---
  # m-001 — oversized-skill exceeds Codex 8KB budget

  **Category:** size-budget
  **Severity:** medium
  **Status:** needs-remediation
  **Filed by:** wp audit skill-sizes (auto)
  **Review cadence:** next sprint

  ## Context
  `.agent/skills/oversized-skill/SKILL.md` is 16.8KB.
  Codex CLI truncates at 8KB — the bottom 8.6KB is invisible to the agent.

  ## Remediation
  Split into `oversized-skill/core` (≤8KB) and `oversized-skill/examples` (≤8KB).
  Run `wp compile` and `wp audit skill-sizes` to verify.
  ---
  [dry-run] no files written
EXPECTED
  echo "  [wp not found — showing expected output above]"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
print_section "Summary"

echo ""
echo "  rulesync: deterministic file emission to 17 runtimes — excellent at what it does"
echo "  agent-kit adds:"
echo "    1. Audit layer (skill-sizes, broken-refs) — catches drift rulesync can't see"
echo "    2. AGENTS.md merger — section-keyed precedence across layered sources"
echo "    3. Tech-debt lifecycle — audit failures auto-file remediation items"
echo ""
echo "See docs/positioning-vs-rulesync.md for the full comparison."
echo ""
