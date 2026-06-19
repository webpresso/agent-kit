#!/usr/bin/env bash
# check-bench-thresholds.sh — Parse Criterion JSON output and fail CI if thresholds are exceeded.
#
# Criterion exits successfully after recording measurements; it does not enforce
# project SLOs. Criterion estimates.json currently exposes benchmark-specific
# estimates such as mean and median, not p99. This gate therefore enforces the
# reported mean and median directly and does not synthesize fake percentile data.
#
# Usage: native/session-memory-engine/scripts/check-bench-thresholds.sh

set -euo pipefail

DEFAULT_MEAN_THRESHOLD_NS=${MEAN_THRESHOLD_NS:-2000000}       # 2ms
DEFAULT_MEDIAN_THRESHOLD_NS=${MEDIAN_THRESHOLD_NS:-500000}   # 0.5ms

# Benchmark-specific SLOs use Criterion's reported mean/median directly.
# Indexing intentionally processes a batch and has a different unit of work than
# hot search/capture/restore paths, so it gets its own honest threshold instead
# of a fake percentile proxy.
declare -A MEAN_THRESHOLDS_NS=(
  [index_100_chunks]=350000000
  [capture_event]=2000000
  [restore_100_events]=1000000
  [search_porter_1000_docs]=1000000
  [search_porter_scoped_1000_docs]=1000000
  [snapshot_50_events]=500000
)
declare -A MEDIAN_THRESHOLDS_NS=(
  [index_100_chunks]=350000000
  [capture_event]=2000000
  [restore_100_events]=1000000
  [search_porter_1000_docs]=1000000
  [search_porter_scoped_1000_docs]=1000000
  [snapshot_50_events]=500000
)

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
CRATE_ROOT=$(cd -- "$SCRIPT_DIR/.." && pwd)
CRITERION_DIR=${CRITERION_DIR:-"$CRATE_ROOT/target/criterion"}
FAILED=0

if [[ ! -d "$CRITERION_DIR" ]]; then
  echo "ERROR: $CRITERION_DIR not found. Run 'cargo bench' first." >&2
  exit 1
fi

mapfile -t ESTIMATES < <(find "$CRITERION_DIR" -name "estimates.json" -type f | sort)

if [[ ${#ESTIMATES[@]} -eq 0 ]]; then
  echo "ERROR: No estimates.json files found in $CRITERION_DIR" >&2
  exit 1
fi

echo "Checking Criterion benchmark thresholds..."
echo "  default mean threshold:   ${DEFAULT_MEAN_THRESHOLD_NS} ns"
echo "  default median threshold: ${DEFAULT_MEDIAN_THRESHOLD_NS} ns"
echo ""

for file in "${ESTIMATES[@]}"; do
  bench_name=${file#"$CRITERION_DIR"/}
  bench_name=${bench_name%/new/estimates.json}
  bench_name=${bench_name%/estimates.json}

  threshold_key=${bench_name%/base}
  mean_threshold_ns=${MEAN_THRESHOLDS_NS[$threshold_key]:-$DEFAULT_MEAN_THRESHOLD_NS}
  median_threshold_ns=${MEDIAN_THRESHOLDS_NS[$threshold_key]:-$DEFAULT_MEDIAN_THRESHOLD_NS}

  parsed=$(python3 - "$file" <<'PY'
import json
import sys

path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as handle:
    data = json.load(handle)

def point(name: str):
    value = data.get(name)
    if not isinstance(value, dict):
        return None
    estimate = value.get('point_estimate')
    if not isinstance(estimate, (int, float)):
        return None
    return int(estimate)

mean = point('mean')
median = point('median')
# Older Criterion reports may call the median-like estimate "typical".
if median is None:
    median = point('typical')

if mean is None or median is None:
    missing = []
    if mean is None:
        missing.append('mean.point_estimate')
    if median is None:
        missing.append('median.point_estimate')
    print('ERROR\t' + ','.join(missing))
else:
    print(f'OK\t{mean}\t{median}')
PY
)

  IFS=$'\t' read -r status first second <<<"$parsed"
  if [[ "$status" != "OK" ]]; then
    echo "  $bench_name: FAIL (could not parse $first from $file)"
    FAILED=1
    continue
  fi

  mean_ns=$first
  median_ns=$second
  echo -n "  $bench_name: mean=${mean_ns} ns, median=${median_ns} ns"

  if [[ $mean_ns -gt $mean_threshold_ns ]]; then
    echo " — FAIL (mean ${mean_ns} ns > ${mean_threshold_ns} ns)"
    FAILED=1
  elif [[ $median_ns -gt $median_threshold_ns ]]; then
    echo " — FAIL (median ${median_ns} ns > ${median_threshold_ns} ns)"
    FAILED=1
  else
    echo " — OK"
  fi
done

echo ""
if [[ $FAILED -ne 0 ]]; then
  echo "FAIL: One or more Criterion benchmarks exceeded SLO thresholds."
  echo "      Investigate WHY (see no-timeout-as-fix rule) — do not raise thresholds."
  exit 1
fi

echo "PASS: All Criterion benchmarks are within SLO thresholds."
