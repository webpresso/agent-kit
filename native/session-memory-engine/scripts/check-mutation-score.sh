#!/usr/bin/env bash
# check-mutation-score.sh — Parse cargo-mutants output and fail CI if score < 70%.
#
# cargo-mutants has no built-in threshold flag — this script reads the output directory.
#
# Usage: ./scripts/check-mutation-score.sh [mutants-output-dir]
#   Default output dir: mutants.out

set -euo pipefail

THRESHOLD=70  # percent
MUTANTS_DIR="${1:-mutants.out}"

if [[ ! -d "$MUTANTS_DIR" ]]; then
    echo "ERROR: $MUTANTS_DIR not found. Run 'cargo mutants' first." >&2
    exit 1
fi

# cargo-mutants produces: caught.txt, missed.txt, unviable.txt, timeout.txt
CAUGHT_FILE="$MUTANTS_DIR/caught.txt"
MISSED_FILE="$MUTANTS_DIR/missed.txt"
UNVIABLE_FILE="$MUTANTS_DIR/unviable.txt"

count_lines() {
    local f="$1"
    if [[ -f "$f" ]]; then
        # Subtract 1 for header line if present
        wc -l < "$f" | tr -d ' '
    else
        echo "0"
    fi
}

CAUGHT=$(count_lines "$CAUGHT_FILE")
MISSED=$(count_lines "$MISSED_FILE")
UNVIABLE=$(count_lines "$UNVIABLE_FILE")

TOTAL=$((CAUGHT + MISSED))

if [[ $TOTAL -eq 0 ]]; then
    echo "WARNING: No mutants found. Either no code was mutated or cargo-mutants failed."
    echo "         Check $MUTANTS_DIR for details."
    exit 0
fi

# Score = caught / (caught + missed) * 100
SCORE=$(python3 -c "print(round($CAUGHT / $TOTAL * 100, 2))")
SCORE_INT=$(python3 -c "print(int($CAUGHT / $TOTAL * 100))")

echo "Mutation score report:"
echo "  Caught:    $CAUGHT"
echo "  Missed:    $MISSED"
echo "  Unviable:  $UNVIABLE"
echo "  Total:     $TOTAL"
echo "  Score:     ${SCORE}%"
echo "  Threshold: ${THRESHOLD}%"
echo ""

if [[ $SCORE_INT -lt $THRESHOLD ]]; then
    echo "FAIL: Mutation score ${SCORE}% is below threshold ${THRESHOLD}%."
    echo "      Review missed mutants in $MISSED_FILE and add tests to cover them."
    exit 1
else
    echo "PASS: Mutation score ${SCORE}% meets threshold ${THRESHOLD}%."
fi
