import { spawnSync } from "node:child_process";
import { parseAllowedWpCommand } from "./gates.js";
export { parseAllowedWpCommand };
export type PromotionTrustInput = {
    repoRoot: string;
    file: string;
    markdown: string;
    now?: Date;
};
export declare function applyPromotionTrustGate(input: PromotionTrustInput): string;
export declare function runPromotionCommand(repoRoot: string, command: string, deps?: {
    spawn?: typeof spawnSync;
}): void;
//# sourceMappingURL=promotion.d.ts.map