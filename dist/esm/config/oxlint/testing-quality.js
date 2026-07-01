// @ts-nocheck
// Webpresso testing quality rules — replaces GritQL patterns:
// - no-weak-assertions (no-tobefalsy, no-tobedefined)
// - no-bare-spy-assertions
// - no-internal-mocks
// - no-real-timers-in-tests
const noWeakAssertions = {
    create(context) {
        return {
            CallExpression(node) {
                if (node.callee.type !== "MemberExpression" || node.callee.property.type !== "Identifier") {
                    return;
                }
                const method = node.callee.property.name;
                const weak = ["toBeTruthy", "toBeFalsy", "toBeDefined", "toBeUndefined", "toBeTypeOf"];
                if (!weak.includes(method))
                    return;
                if (node.arguments.length > 0 && method !== "toBeTypeOf")
                    return;
                const messages = {
                    toBeTruthy: "Weak assertion: toBeTruthy() matches too many values. Use toBe(true) for strict equality.",
                    toBeFalsy: "Weak assertion: toBeFalsy() matches too many values. Use toBe(false) for strict equality.",
                    toBeDefined: "Weak assertion: toBeDefined() allows equivalent mutants. Use toBe(expectedValue) or toEqual(expectedValue).",
                    toBeUndefined: "Weak assertion: toBeUndefined() allows equivalent mutants. Use toBe(undefined) explicitly.",
                    toBeTypeOf: "Weak assertion: toBeTypeOf() only checks the type, not the value. Use toBe(expectedValue) or toEqual(expectedValue).",
                };
                context.report({ node: node.callee.property, message: messages[method] });
            },
        };
    },
};
const noBareSpy = {
    create(context) {
        return {
            CallExpression(node) {
                if (node.callee.type !== "MemberExpression" ||
                    node.callee.property.type !== "Identifier" ||
                    node.callee.property.name !== "toHaveBeenCalled" ||
                    node.arguments.length > 0) {
                    return;
                }
                // Allow .not.toHaveBeenCalled()
                const obj = node.callee.object;
                if (obj.type === "MemberExpression" &&
                    obj.property.type === "Identifier" &&
                    obj.property.name === "not") {
                    return;
                }
                context.report({
                    node: node.callee.property,
                    message: "Weak spy assertion: toHaveBeenCalled() without arguments. Use toHaveBeenCalledWith(expected), toHaveBeenNthCalledWith(n, expected), or toHaveBeenCalledTimes(count).",
                });
            },
        };
    },
};
const noInternalMocks = {
    create(context) {
        return {
            CallExpression(node) {
                if (node.callee.type !== "MemberExpression" ||
                    node.callee.object.type !== "Identifier" ||
                    node.callee.object.name !== "vi" ||
                    node.callee.property.type !== "Identifier" ||
                    node.callee.property.name !== "mock") {
                    return;
                }
                const arg = node.arguments[0];
                if (!arg || arg.type !== "Literal" || typeof arg.value !== "string")
                    return;
                if (arg.value.includes("@webpresso")) {
                    // Allow mocking I/O boundary modules (filesystem loaders/writers)
                    // These are legitimate mock targets even in unit tests
                    const ioBoundaryPrefixes = [
                        "@webpresso/schema-loaders/", // YAML filesystem loaders & writers
                        "@webpresso/scripts/", // Repo-wide scripts & dev orchestration I/O boundaries
                    ];
                    if (ioBoundaryPrefixes.some((prefix) => arg.value.startsWith(prefix)))
                        return;
                    context.report({
                        node: arg,
                        message: "Mocking internal @webpresso/* package. Use real dependencies (PGlite for DB, real services for logic). Convert to .integration.test.ts if needed.",
                    });
                }
            },
        };
    },
};
const noRealTimers = {
    create(context) {
        return {
            NewExpression(node) {
                if (node.callee.type !== "Identifier" || node.callee.name !== "Promise") {
                    return;
                }
                const arg = node.arguments[0];
                if (!arg || (arg.type !== "ArrowFunctionExpression" && arg.type !== "FunctionExpression")) {
                    return;
                }
                const body = arg.body.type === "CallExpression"
                    ? arg.body
                    : arg.body.type === "BlockStatement" &&
                        arg.body.body.length === 1 &&
                        arg.body.body[0].type === "ExpressionStatement"
                        ? arg.body.body[0].expression
                        : null;
                if (body &&
                    body.type === "CallExpression" &&
                    body.callee.type === "Identifier" &&
                    body.callee.name === "setTimeout") {
                    context.report({
                        node,
                        message: "setTimeout inside Promise constructor will hang with fake timers. Use await Promise.resolve() for microtask delays, or vi.advanceTimersByTimeAsync() for time-based delays.",
                    });
                }
            },
        };
    },
};
function isTestCall(node) {
    const { callee } = node;
    if (callee.type === "Identifier")
        return callee.name === "it" || callee.name === "test";
    return false;
}
function isBeforeAllCall(node) {
    const { callee } = node;
    return callee.type === "Identifier" && callee.name === "beforeAll";
}
const noColdDynamicImport = {
    create(context) {
        // Track depth inside it()/test() callback bodies via the linter's own traversal.
        // Using ':exit' to decrement so we never need to walk the subtree manually
        // (manual walks hit circular parent back-references in oxlint's proxy AST).
        let testDepth = 0;
        let beforeAllDepth = 0;
        const prewarmedModules = new Set();
        return {
            CallExpression(node) {
                if (isTestCall(node))
                    testDepth++;
                if (isBeforeAllCall(node))
                    beforeAllDepth++;
            },
            "CallExpression:exit"(node) {
                if (isTestCall(node))
                    testDepth--;
                if (isBeforeAllCall(node))
                    beforeAllDepth--;
            },
            ImportExpression(node) {
                const src = node.source;
                if (src.type !== "Literal" || typeof src.value !== "string")
                    return;
                if (!src.value.startsWith("@webpresso/") && !src.value.startsWith("#"))
                    return;
                // Track modules pre-warmed in beforeAll
                if (beforeAllDepth > 0) {
                    prewarmedModules.add(src.value);
                    return;
                }
                if (testDepth === 0)
                    return;
                // Skip if module was pre-warmed via beforeAll
                if (prewarmedModules.has(src.value))
                    return;
                context.report({
                    node: src,
                    message: `Dynamic @webpresso/* import inside test body causes cold-start timeouts under parallel execution. ` +
                        `Add \`beforeAll(() => import('${src.value}'))\` at the top of the file to pre-warm the module cache.`,
                });
            },
        };
    },
};
const plugin = {
    meta: { name: "webpresso-testing" },
    rules: {
        "no-weak-assertions": noWeakAssertions,
        "no-bare-spy-assertions": noBareSpy,
        "no-internal-mocks": noInternalMocks,
        "no-real-timers-in-tests": noRealTimers,
        "no-cold-dynamic-import": noColdDynamicImport,
    },
};
export default plugin;
//# sourceMappingURL=testing-quality.js.map