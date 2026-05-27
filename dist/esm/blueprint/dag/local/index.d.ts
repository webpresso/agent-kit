/**
 * webpresso blueprint/dag/local
 *
 * Node.js-only DAG utilities for local CLI execution.
 * These modules use `node:fs` and `node:path` — DO NOT import in Workers bundles.
 *
 * For workers-safe DAG utilities, use the parent `dag` subpath instead.
 *
 * @packageDocumentation
 */
export type { FalseDependency, ParallelizeResult, TaskFiles, TaskPairAnalysis, } from './independence.js';
export { createMockPackageGraph, IndependenceDetector } from './independence.js';
export { createMockFileSystem, PackageGraph, realFileSystem } from './package-graph.js';
//# sourceMappingURL=index.d.ts.map