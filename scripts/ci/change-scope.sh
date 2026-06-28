#!/usr/bin/env bash
set -euo pipefail

# Decide whether expensive optional CI jobs must run.
# Native session-memory checks are Rust/addon checks. For pull requests, run
# them only when a changed path can affect those native checks or their CI
# wiring. Empty/indeterminate diffs and non-PR events still fail closed below.

is_native_session_memory_impact_path() {
  local path="$1"
  case "$path" in
    native/session-memory-engine/*) return 0 ;;
    *.rs) return 0 ;;
    Cargo.toml | Cargo.lock | */Cargo.toml | */Cargo.lock) return 0 ;;
    rust-toolchain.toml | */rust-toolchain.toml | deny.toml | */deny.toml) return 0 ;;
    package.json | pnpm-lock.yaml | pnpm-workspace.yaml) return 0 ;;
    .github/workflows/ci.agent-kit.yml) return 0 ;;
    scripts/ci/change-scope.sh) return 0 ;;
    scripts/build-runtime-binaries.ts) return 0 ;;
    scripts/build-session-memory-native-artifacts.ts) return 0 ;;
    scripts/stage-plugin-runtime-artifacts.ts) return 0 ;;
    scripts/stage-session-memory-native-artifacts.ts) return 0 ;;
    src/build/native-session-memory-ci.test.ts) return 0 ;;
    *) return 1 ;;
  esac
}

native_session_memory_changed_for_files() {
  local saw_file="false"
  local path
  while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    saw_file="true"
    if is_native_session_memory_impact_path "$path"; then
      printf 'true\n'
      return 0
    fi
  done

  # An empty or unparsable diff should not skip the native job.
  if [[ "$saw_file" != "true" ]]; then
    printf 'true\n'
    return 0
  fi

  printf 'false\n'
}

if [[ "${1:-}" == "classify" || "${1:-}" == "classify-native" ]]; then
  shift
  if [[ "$#" -eq 0 ]]; then
    native_session_memory_changed_for_files
  else
    printf '%s\n' "$@" | native_session_memory_changed_for_files
  fi
  exit 0
fi

output_path="${GITHUB_OUTPUT:-}"
if [[ -z "$output_path" ]]; then
  echo "GITHUB_OUTPUT is required unless using classify mode" >&2
  exit 1
fi

# Write conservative defaults before any operation that could fail or be
# interrupted. If later probes prove a job is unnecessary, the final appended
# value wins.
echo "native_session_memory_changed=true" >> "$output_path"
echo "playwright_e2e_present=true" >> "$output_path"

if [[ -f playwright.config.ts ]]; then
  echo "playwright_e2e_present=true" >> "$output_path"
  echo "CI change scope: playwright.config.ts present; running E2E."
else
  echo "playwright_e2e_present=false" >> "$output_path"
  echo "CI change scope: playwright.config.ts absent; skipping E2E job."
fi

if [[ "${GITHUB_EVENT_NAME:-}" != "pull_request" ]]; then
  echo "Native session-memory scope: non-PR event (${GITHUB_EVENT_NAME:-unset}); running native checks."
  exit 0
fi

base_sha="${BASE_SHA:-}"
head_sha="${HEAD_SHA:-}"
if [[ -z "$base_sha" || -z "$head_sha" ]]; then
  echo "BASE_SHA and HEAD_SHA are required for pull_request scope detection" >&2
  exit 1
fi

changed_files="$(git diff --name-only --no-renames "$base_sha" "$head_sha")"
result="$(printf '%s\n' "$changed_files" | native_session_memory_changed_for_files)"
echo "native_session_memory_changed=$result" >> "$output_path"

echo "Native session-memory scope: native_session_memory_changed=$result"
if [[ "$result" == "false" ]]; then
  echo "Native session-memory scope: no native session-memory CI inputs changed."
fi
