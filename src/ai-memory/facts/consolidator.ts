import type { Fact, FactConsolidationOptions, FactConsolidationResult, FactId } from './types.js'

export interface FactDatabase {
  findByThread(threadId: string): Promise<Fact[]>
  update(id: FactId, updates: Partial<Fact>): Promise<void>
  delete(id: FactId): Promise<void>
  insert(fact: Fact): Promise<void>
}

export class FactConsolidator {
  private db: FactDatabase

  constructor(db: FactDatabase) {
    this.db = db
  }

  async consolidate(options: FactConsolidationOptions): Promise<FactConsolidationResult> {
    const facts = await this.db.findByThread(options.threadId)

    if (!facts.length) {
      return { merged: 0, invalidated: 0, remaining: 0 }
    }

    const threshold = options.similarityThreshold ?? 0.85
    const invalidateSuperseded = options.invalidateSuperseded ?? true
    const byCategory = this.groupByCategory(facts)

    let merged = 0
    let invalidated = 0

    for (const [, categoryFacts] of Object.entries(byCategory)) {
      const result = await this.consolidateCategory(categoryFacts, threshold, invalidateSuperseded)
      merged += result.merged
      invalidated += result.invalidated
    }

    const remainingFacts = await this.db.findByThread(options.threadId)
    const remaining = remainingFacts.filter((fact) => !fact.invalidated).length

    return { merged, invalidated, remaining }
  }

  private async consolidateCategory(
    facts: Fact[],
    threshold: number,
    invalidateSuperseded: boolean,
  ): Promise<{ merged: number; invalidated: number }> {
    if (facts.length <= 1) {
      return { merged: 0, invalidated: 0 }
    }

    const similarPairs = this.findSimilarPairs(facts, threshold)

    let merged = 0
    let invalidated = 0
    const processed = new Set<FactId>()

    for (const [fact1, fact2] of similarPairs) {
      if (processed.has(fact1.id) || processed.has(fact2.id)) continue

      const [keeper, superseded] = this.selectKeeper(fact1, fact2)

      if (invalidateSuperseded) {
        await this.db.update(superseded.id, {
          invalidated: true,
          invalidationReason: `Superseded by ${keeper.id}`,
        })
        invalidated++
      } else {
        await this.db.delete(superseded.id)
      }

      await this.db.update(keeper.id, {
        accessCount: keeper.accessCount + superseded.accessCount,
      })

      processed.add(fact1.id)
      processed.add(fact2.id)
      merged++
    }

    return { merged, invalidated }
  }

  private groupByCategory(facts: Fact[]): Record<string, Fact[]> {
    const groups: Record<string, Fact[]> = {}

    for (const fact of facts) {
      if (fact.invalidated) continue

      if (!groups[fact.category]) {
        groups[fact.category] = []
      }
      groups[fact.category]?.push(fact)
    }

    return groups
  }

  private checkFactPair(
    fact1: Fact | undefined,
    fact2: Fact | undefined,
    threshold: number,
  ): [Fact, Fact] | null {
    if (!fact1 || !fact2) return null
    const similarity = this.calculateSimilarity(fact1, fact2)
    return similarity >= threshold ? [fact1, fact2] : null
  }

  private sortPairsBySimilarity(pairs: Array<[Fact, Fact]>): Array<[Fact, Fact]> {
    return pairs.toSorted((a, b) => {
      const simA = this.calculateSimilarity(a[0], a[1])
      const simB = this.calculateSimilarity(b[0], b[1])
      return simB - simA
    })
  }

  private findSimilarPairs(facts: Fact[], threshold: number): Array<[Fact, Fact]> {
    const pairs: Array<[Fact, Fact]> = []

    for (let i = 0; i < facts.length; i++) {
      for (let j = i + 1; j < facts.length; j++) {
        const pair = this.checkFactPair(facts[i], facts[j], threshold)
        if (pair) pairs.push(pair)
      }
    }

    return this.sortPairsBySimilarity(pairs)
  }

  private calculateSimilarity(fact1: Fact, fact2: Fact): number {
    if (fact1.embedding && fact2.embedding) {
      return this.cosineSimilarity(fact1.embedding, fact2.embedding)
    }

    return this.textSimilarity(fact1.content, fact2.content)
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0

    let dotProduct = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < a.length; i++) {
      const aVal = a[i] ?? 0
      const bVal = b[i] ?? 0
      dotProduct += aVal * bVal
      normA += aVal * aVal
      normB += bVal * bVal
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB)
    return denominator === 0 ? 0 : dotProduct / denominator
  }

  private textSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/))
    const words2 = new Set(text2.toLowerCase().split(/\s+/))
    const intersection = new Set([...words1].filter((word) => words2.has(word)))
    const union = new Set([...words1, ...words2])
    return union.size === 0 ? 0 : intersection.size / union.size
  }

  private selectKeeper(fact1: Fact, fact2: Fact): [Fact, Fact] {
    const confidenceOrder: Record<string, number> = { high: 3, medium: 2, low: 1 }
    const conf1 = confidenceOrder[fact1.confidence] ?? 0
    const conf2 = confidenceOrder[fact2.confidence] ?? 0

    if (conf1 !== conf2) {
      return conf1 > conf2 ? [fact1, fact2] : [fact2, fact1]
    }

    return fact1.createdAt > fact2.createdAt ? [fact1, fact2] : [fact2, fact1]
  }
}

export function createFactConsolidator(db: FactDatabase): FactConsolidator {
  return new FactConsolidator(db)
}
