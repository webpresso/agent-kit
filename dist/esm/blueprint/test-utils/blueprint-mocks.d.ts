/**
 * Shared test utilities for blueprint mocking
 */
import type { Blueprint, Task } from '#core/parser';
export interface MockBlueprintOptions {
    slug?: string;
    name?: string;
    status?: string;
    complexity?: string;
    lastUpdated?: string;
    tasks?: Task[];
    phases?: Blueprint['phases'];
    raw?: string;
}
export interface MockTaskOptions {
    id?: string;
    title?: string;
    status?: Task['status'];
    depends?: string[];
    acceptanceCriteria?: Task['acceptanceCriteria'];
}
/**
 * Create a mock Plan with sensible defaults
 */
export declare function createMockBlueprint(options?: MockBlueprintOptions): Blueprint;
/**
 * Create a mock Task with sensible defaults
 */
export declare function createMockTask(options?: MockTaskOptions): Task;
//# sourceMappingURL=blueprint-mocks.d.ts.map