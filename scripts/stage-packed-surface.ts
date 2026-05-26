#!/usr/bin/env bun

import { resolve } from 'node:path'

import { stagePublishableTarballSurface } from '../src/audit/package-surface.ts'

const target = process.argv[2]
if (!target) {
  console.error('Usage: bun scripts/stage-packed-surface.ts <destination-dir> [root-dir]')
  process.exit(1)
}

const root = resolve(process.argv[3] ?? process.cwd())
const destination = resolve(target)
const result = stagePublishableTarballSurface(root, destination)
console.log(
  JSON.stringify(
    {
      root,
      destination,
      packageCount: result.packageCount,
      fileCount: result.fileCount,
    },
    null,
    2,
  ),
)
