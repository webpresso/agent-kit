// @ts-nocheck
// Webpresso code safety rules — replaces GritQL patterns:
// - as_any_audit (audit unsafe `as any` casts)
// - no_swallowed_errors (catch blocks that only console.error)

const asAnyAudit = {
  create(context) {
    return {
      TSAsExpression(node) {
        const annotation = node.typeAnnotation;
        if (
          annotation.type === "TSAnyKeyword" ||
          (annotation.type === "TSTypeReference" &&
            annotation.typeName?.type === "Identifier" &&
            annotation.typeName.name === "any")
        ) {
          context.report({
            node: annotation,
            message:
              "Unsafe `as any` cast. Use a specific type, `as unknown`, or a type guard instead.",
          });
        }
      },
    };
  },
};

const ALLOWED_ACTIONS = new Set(["throw", "setError", "toast", "reportError", "return"]);

function hasAllowedAction(body) {
  if (!body || body.type !== "BlockStatement") return false;
  for (const stmt of body.body) {
    if (stmt.type === "ThrowStatement") return true;
    if (stmt.type === "ReturnStatement") return true;
    if (stmt.type === "ExpressionStatement" && stmt.expression.type === "CallExpression") {
      const callee = stmt.expression.callee;
      // setError(...), reportError(...)
      if (callee.type === "Identifier" && ALLOWED_ACTIONS.has(callee.name)) return true;
      // toast.error(...)
      if (
        callee.type === "MemberExpression" &&
        callee.object.type === "Identifier" &&
        ALLOWED_ACTIONS.has(callee.object.name)
      ) {
        return true;
      }
    }
  }
  return false;
}

function hasConsoleError(body) {
  if (!body || body.type !== "BlockStatement") return false;
  for (const stmt of body.body) {
    if (
      stmt.type === "ExpressionStatement" &&
      stmt.expression.type === "CallExpression" &&
      stmt.expression.callee.type === "MemberExpression" &&
      stmt.expression.callee.object.type === "Identifier" &&
      stmt.expression.callee.object.name === "console" &&
      stmt.expression.callee.property.type === "Identifier" &&
      stmt.expression.callee.property.name === "error"
    ) {
      return true;
    }
  }
  return false;
}

const noSwallowedErrors = {
  create(context) {
    return {
      CatchClause(node) {
        const body = node.body;
        if (!body || body.type !== "BlockStatement") return;
        if (body.body.length === 0) return;
        if (hasConsoleError(body) && !hasAllowedAction(body)) {
          context.report({
            node,
            message:
              "Catch block only logs with console.error — error is swallowed. Re-throw, return an error value, or use toast.error()/setError()/reportError().",
          });
        }
      },
    };
  },
};

const plugin = {
  meta: { name: "webpresso-safety" },
  rules: {
    "as-any-audit": asAnyAudit,
    "no-swallowed-errors": noSwallowedErrors,
  },
};

export default plugin;
