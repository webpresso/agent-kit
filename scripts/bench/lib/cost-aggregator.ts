import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { z } from 'zod'

import type { Usage } from './usage-extractor'

export const pricingEntrySchema = z.object({
  model: z.string().min(1),
  aliases: z.array(z.string().min(1)).min(1),
  effective_on: z.string().min(1),
  source: z.string().url(),
  input_per_mtok_usd: z.number().nonnegative(),
  output_per_mtok_usd: z.number().nonnegative(),
  cache_write_per_mtok_usd: z.number().nonnegative(),
  cache_read_per_mtok_usd: z.number().nonnegative(),
})

export const pricingTableSchema = z.object({
  version: z.number().int().positive(),
  entries: z.array(pricingEntrySchema).min(1),
})

export type PricingEntry = z.infer<typeof pricingEntrySchema>
export type PricingTable = z.infer<typeof pricingTableSchema>

export type CostSummary = {
  mean: number
  std: number
  n: number
  total: number
}

const MTOK = 1_000_000
const benchLibDir = dirname(fileURLToPath(import.meta.url))
const DEFAULT_PRICING_PATH = resolve(benchLibDir, '..', 'pricing.json')

function roundUsd(value: number): number {
  return Number(value.toFixed(6))
}

function resolvePricingEntry(model: string, pricing: PricingTable): PricingEntry {
  const entry = pricing.entries.find(
    (candidate) => candidate.model === model || candidate.aliases.includes(model),
  )

  if (!entry) {
    throw new Error(`Missing pricing for model: ${model}`)
  }

  return entry
}

export function loadPricing(pricingPath = DEFAULT_PRICING_PATH): PricingTable {
  const raw = readFileSync(pricingPath, 'utf8')
  return pricingTableSchema.parse(JSON.parse(raw))
}

export function costOf(usage: Usage, pricing: PricingTable, model: string): number {
  const entry = resolvePricingEntry(model, pricing)

  const total =
    (usage.input_tokens / MTOK) * entry.input_per_mtok_usd +
    (usage.output_tokens / MTOK) * entry.output_per_mtok_usd +
    (usage.cache_creation_input_tokens / MTOK) * entry.cache_write_per_mtok_usd +
    (usage.cache_read_input_tokens / MTOK) * entry.cache_read_per_mtok_usd

  return roundUsd(total)
}

export function aggregateCosts(usages: Usage[], pricing: PricingTable, model: string): CostSummary {
  const costs = usages.map((usage) => costOf(usage, pricing, model))
  const n = costs.length

  if (n === 0) {
    return { mean: 0, std: 0, n: 0, total: 0 }
  }

  const total = roundUsd(costs.reduce((sum, value) => sum + value, 0))
  const mean = roundUsd(total / n)
  const variance = costs.reduce((sum, value) => sum + (value - mean) ** 2, 0) / n
  const std = roundUsd(Math.sqrt(variance))

  return { mean, std, n, total }
}
