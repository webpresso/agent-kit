export declare class CycleDetector {
    private edges;
    private visited;
    private recStack;
    private path;
    private cycles;
    constructor(edges: Map<string, Set<string>>);
    detect(nodes: IterableIterator<string>): string[][] | null;
    private dfs;
    private processNeighbor;
}
//# sourceMappingURL=cycle-detector.d.ts.map