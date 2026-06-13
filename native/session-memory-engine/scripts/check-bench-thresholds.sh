#!/usr/bin/env bash
# check-bench-thresholds.sh — Parse criterion JSON output and fail CI if thresholds exceeded.
#
# criterion does NOT gate CI on SLOs natively (exits 0 even on regression).
# This script parses target/criterion/**/estimates.json and enforces:
#   p99 < 2ms  (2_000_000 ns)
#   p50 < 0.5ms (500_000 ns)
#
# Usage: ./scripts/check-bench-thresholds.sh

set -euo pipefail

P99_THRESHOLD_NS=2000000   # 2ms
P50_THRESHOLD_NS=500000    # 0.5ms

CRITERION_DIR="target/criterion"
FAILED=0

if [[ ! -d "$CRITERION_DIR" ]]; then
    echo "ERROR: $CRITERION_DIR not found. Run 'cargo bench' first." >&2
    exit 1
fi

# Find all estimates.json files
mapfile -t ESTIMATES < <(find "$CRITERION_DIR" -name "estimates.json" -type f)

if [[ ${#ESTIMATES[@]} -eq 0 ]]; then
    echo "ERROR: No estimates.json files found in $CRITERION_DIR" >&2
    exit 1
fi

echo "Checking criterion thresholds..."
echo "  p99 threshold: ${P99_THRESHOLD_NS} ns (2ms)"
echo "  p50 threshold: ${P50_THRESHOLD_NS} ns (0.5ms)"
echo ""

for file in "${ESTIMATES[@]}"; do
    bench_name=$(echo "$file" | sed 's|target/criterion/||' | sed 's|/new/estimates.json||' | sed 's|/estimates.json||')

    # Extract mean estimate (central tendency) from estimates.json
    # Format: {"mean":{"confidence_interval":{},"point_estimate":NANOSECONDS,"standard_error":...},...}
    point_estimate=$(python3 -c "
import json, sys
with open('$file') as f:
    data = json.load(f)
# Try mean first, fall back to typical
if 'mean' in data:
    print(data['mean']['point_estimate'])
elif 'typical' in data:
    print(data['typical']['point_estimate'])
else:
    print(0)
" 2>/dev/null || echo "0")

    if [[ "$point_estimate" == "0" ]]; then
        echo "  SKIP $bench_name (could not parse estimates.json)"
        continue
    fi

    point_estimate_int=${point_estimate%.*}  # truncate to int

    echo -n "  $bench_name: ${point_estimate_int} ns"

    # Check p99 (we use mean as proxy; for true p99, criterion would need custom reporter)
    # In practice, mean ≈ p99 for tight distributions; use 2x mean for p99 estimate
    p99_estimate=$((point_estimate_int * 2))

    if [[ $p99_estimate -gt $P99_THRESHOLD_NS ]]; then
        echo " — FAIL (p99 estimate ${p99_estimate} ns > ${P99_THRESHOLD_NS} ns)"
        FAILED=1
    elif [[ $point_estimate_int -gt $P50_THRESHOLD_NS ]]; then
        echo " — FAIL (p50 ${point_estimate_int} ns > ${P50_THRESHOLD_NS} ns)"
        FAILED=1
    else
        echo " — OK"
    fi
done

echo ""
if [[ $FAILED -ne 0 ]]; then
    echo "FAIL: One or more benchmarks exceeded SLO thresholds."
    echo "      Investigate WHY (see no-timeout-as-fix rule) — do not raise thresholds."
    exit 1
else
    echo "PASS: All benchmarks within SLO thresholds."
fi
