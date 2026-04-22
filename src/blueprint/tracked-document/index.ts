/**
 * Tracked Document Domain Logic
 *
 * Base schemas, types, and utilities for tracked documents (Blueprints, TechDebt).
 * Tracked documents are markdown files with YAML frontmatter that track status over time.
 *
 * This provides the foundation layer that specific document types (Blueprint, TechDebt)
 * extend with their own fields and behavior.
 */

export * from './schema'
