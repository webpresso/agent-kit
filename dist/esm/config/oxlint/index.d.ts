import codeSafety from "./code-safety.js";
import foundationPurity from "./foundation-purity.js";
import graphqlConventions from "./graphql-conventions.js";
import importHygiene from "./import-hygiene.js";
import monorepoNpaths from "./monorepo-paths.js";
import queryPatterns from "./query-patterns.js";
import testingQuality from "./testing-quality.js";
import tierBoundaries from "./tier-boundaries.js";
type OxlintRuleSeverity = "error";
interface OxlintPlugin {
    meta: {
        name: string;
    };
    rules: Record<string, unknown>;
}
export { codeSafety, foundationPurity, graphqlConventions, importHygiene, monorepoNpaths, queryPatterns, testingQuality, tierBoundaries, };
export declare const plugins: Record<string, OxlintPlugin>;
export declare const rules: Record<string, OxlintRuleSeverity>;
export declare const config: {
    plugins: Record<string, OxlintPlugin>;
    rules: Record<string, "error">;
};
//# sourceMappingURL=index.d.ts.map