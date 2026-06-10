#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

cd "$ROOT_DIR"
# Pack-like proof on a fresh checkout needs the runtime migration SQL assets
# materialized into dist/esm first; keep this repo-local audit hermetic by
# syncing those ignored dist files before npm pack triggers prepack.
bun src/build/blueprint-migration-assets.ts >/dev/null
# Pack into the temp dir (removed by the EXIT trap), not the repo root. Without
# --pack-destination, npm writes the tarball to cwd and this script never
# removed it, leaving an untracked webpresso-agent-kit-*.tgz in the working
# tree (and racing with any concurrent pack on the same fixed path).
PACK_JSON="$(npm pack --json --pack-destination "$TMP_DIR")"
TARBALL_NAME="$(printf '%s' "$PACK_JSON" | node -e "const input=JSON.parse(require('fs').readFileSync(0,'utf8')); process.stdout.write(input[0].filename)")"
TARBALL_PATH="$TMP_DIR/$TARBALL_NAME"

mkdir -p "$TMP_DIR/unpacked"
tar -xzf "$TARBALL_PATH" -C "$TMP_DIR/unpacked"
PACKED_PACKAGE_JSON="$TMP_DIR/unpacked/package/package.json"

HAS_CONTEXT_MODE="$(node - "$PACKED_PACKAGE_JSON" <<'NODE'
const fs = require('fs')
const packagePath = process.argv[2]
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
const sections = ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']
for (const section of sections) {
  const value = pkg[section]
  if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'context-mode')) {
    process.stdout.write('1')
    process.exit(0)
  }
}
process.stdout.write('0')
NODE
)"

if [[ "$HAS_CONTEXT_MODE" == "1" ]]; then
  echo "context-mode still appears in the packed default package metadata" >&2
  exit 1
fi

echo "ok: packed default package metadata does not contain context-mode"
