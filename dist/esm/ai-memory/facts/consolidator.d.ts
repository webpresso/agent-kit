import type { Fact, FactConsolidationOptions, FactConsolidationResult, FactId } from './types.js';
export interface FactDatabase {
    findByThread(threadId: string): Promise<Fact[]>;
    update(id: FactId, updates: Partial<Fact>): Promise<void>;
    delete(id: FactId): Promise<void>;
    insert(fact: Fact): Promise<void>;
}
export declare class FactConsolidator {
    private db;
    constructor(db: FactDatabase);
    consolidate(options: FactConsolidationOptions): Promise<FactConsolidationResult>;
    private consolidateCategory;
    private groupByCategory;
    private checkFactPair;
    private sortPairsBySimilarity;
    private findSimilarPairs;
    private calculateSimilarity;
    private cosineSimilarity;
    private textSimilarity;
    private selectKeeper;
}
export declare function createFactConsolidator(db: FactDatabase): FactConsolidator;
//# sourceMappingURL=consolidator.d.ts.map