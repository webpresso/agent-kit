import codeSafety from "./code-safety.js";
import foundationPurity from "./foundation-purity.js";
import graphqlConventions from "./graphql-conventions.js";
import importHygiene from "./import-hygiene.js";
import monorepoNpaths from "./monorepo-paths.js";
import queryPatterns from "./query-patterns.js";
import testingQuality from "./testing-quality.js";
import tierBoundaries from "./tier-boundaries.js";
export { codeSafety, foundationPurity, graphqlConventions, importHygiene, monorepoNpaths, queryPatterns, testingQuality, tierBoundaries, };
const pluginEntries = [
    codeSafety,
    foundationPurity,
    graphqlConventions,
    importHygiene,
    monorepoNpaths,
    queryPatterns,
    testingQuality,
    tierBoundaries,
].map((plugin) => [plugin.meta.name, plugin]);
export const plugins = Object.fromEntries(pluginEntries);
export const rules = Object.fromEntries(pluginEntries.flatMap(([pluginName, plugin]) => Object.keys(plugin.rules).map((ruleName) => [
    `${pluginName}/${ruleName}`,
    "error",
])));
export const config = {
    plugins,
    rules,
};
//# sourceMappingURL=index.js.map