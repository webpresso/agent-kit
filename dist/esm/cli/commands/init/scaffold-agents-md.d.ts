import type { AgentkitConfig } from './config.js';
import type { ConsumerContext } from './detect-consumer.js';
import { type MergeOptions, type MergeResult } from './merge.js';
export declare function renderRepositoryMap(consumer: ConsumerContext): string;
export declare function renderTechStack(consumer: ConsumerContext): string;
export interface ScaffoldAgentsMdInput {
    catalogDir: string;
    repoRoot: string;
    consumer: ConsumerContext;
    config: AgentkitConfig;
    options: MergeOptions;
}
export declare function mergeRenderedAgentsMd(rendered: string, existing: string): string | null;
export declare function renderAgentsMd(template: string, consumer: ConsumerContext, config: AgentkitConfig): string;
export declare function scaffoldAgentsMd(input: ScaffoldAgentsMdInput): MergeResult | null;
//# sourceMappingURL=scaffold-agents-md.d.ts.map