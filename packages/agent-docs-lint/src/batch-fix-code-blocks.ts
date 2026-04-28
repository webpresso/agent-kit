#!/usr/bin/env tsx
import { findRepoRoot } from './repo-root.js'
/**
 * Batch fix script to apply code block language inference to all docs
 */
import { lstatSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { fixCodeBlockLanguages } from './fixers/code-language.js'

const DOCS_DIR = join(findRepoRoot(), 'docs')
const MAX_FILES = 200 // Limit to prevent infinite loops on large dirs

function processEntry(collected: string[], fullPath: string): void {
  if (collected.length >= MAX_FILES) return

  const stat = lstatSync(fullPath)
  if (stat.isSymbolicLink()) return
  if (stat.isDirectory()) {
    walkDir(fullPath, collected)
    return
  }
  if (fullPath.endsWith('.md')) collected.push(fullPath)
}

function walkDir(dir: string, collected: string[] = []): string[] {
  if (collected.length >= MAX_FILES) return collected
  for (const entry of readdirSync(dir)) processEntry(collected, join(dir, entry))
  return collected
}

function main() {
  const files = walkDir(DOCS_DIR)
  let totalChanges = 0
  let filesChanged = 0

  console.log(`Processing ${files.length} markdown files...`)

  for (const file of files) {
    const content = readFileSync(file, 'utf-8')
    const { fixed, changes } = fixCodeBlockLanguages(content, file, 0.3)

    if (changes > 0) {
      writeFileSync(file, fixed)
      console.log(`Fixed ${changes} code blocks in ${file.replace(DOCS_DIR, 'docs')}`)
      totalChanges += changes
      filesChanged++
    }
  }

  console.log(`\nTotal: ${totalChanges} fixes in ${filesChanged} files`)
}

if (import.meta.main) {
  main()
}
