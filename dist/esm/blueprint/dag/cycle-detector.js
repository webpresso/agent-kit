export class CycleDetector {
    edges;
    visited = new Set();
    recStack = new Set();
    path = [];
    cycles = [];
    constructor(edges) {
        this.edges = edges;
    }
    detect(nodes) {
        for (const nodeId of nodes) {
            if (!this.visited.has(nodeId) && this.dfs(nodeId)) {
                return this.cycles;
            }
        }
        return this.cycles.length > 0 ? this.cycles : null;
    }
    dfs(nodeId) {
        this.visited.add(nodeId);
        this.recStack.add(nodeId);
        this.path.push(nodeId);
        const edges = this.edges.get(nodeId);
        if (edges) {
            for (const neighbor of edges) {
                if (this.processNeighbor(neighbor))
                    return true;
            }
        }
        this.path.pop();
        this.recStack.delete(nodeId);
        return false;
    }
    processNeighbor(neighbor) {
        if (!this.visited.has(neighbor)) {
            if (this.dfs(neighbor))
                return true;
        }
        else if (this.recStack.has(neighbor)) {
            const cycleStart = this.path.indexOf(neighbor);
            this.cycles.push([...this.path.slice(cycleStart), neighbor]);
            return true;
        }
        return false;
    }
}
//# sourceMappingURL=cycle-detector.js.map