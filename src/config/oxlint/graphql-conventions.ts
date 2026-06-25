// @ts-nocheck
// Webpresso GraphQL convention rules:
// - no-singular-graphql-fields: Prevents use of singular table names in GraphQL queries/mutations
//
// Hasura auto-generates GraphQL root fields from table names. All Webpresso tables use plural names
// (e.g., `users`, `organizations`, `projects`). Using singular names (e.g., `user(limit: 1)`)
// causes runtime errors: "field 'user' not found in type: 'query_root'"
//
// This rule scans template literals and string literals for known singular patterns and reports them.

// Mapping of singular table patterns to their correct plural/actual GraphQL field names.
// Format: [singular, correct, description]
const SINGULAR_TABLE_RULES = [
  ["user", "users", "users"],
  ["organization", "organizations", "organizations"],
  ["member", "members", "members"],
  ["project", "projects", "projects"],
  ["entity", "meta_entities", "meta_entities"],
];

// Build regex patterns for each singular table name.
// These detect GraphQL root field usage patterns:
//   - Query fields:        `user(`, `user {`, `user_by_pk`, `user_aggregate`
//   - Insert mutations:    `insert_user_one`, `insert_user(`
//   - Update mutations:    `update_user_by_pk`, `update_user(`
//   - Delete mutations:    `delete_user_by_pk`, `delete_user(`
function buildPatterns() {
  const patterns = [];

  for (const [singular, correct, label] of SINGULAR_TABLE_RULES) {
    // Intentional internal-only dynamic regex: `singular` values come from the
    // static SINGULAR_TABLE_RULES table above, not from user input.
    // Query root fields: `user {`, `user_by_pk`, `user_aggregate`, `user(where:`, `user(limit:`
    // Must NOT match plural forms (e.g., `users(`) or compound words (e.g., `user_id`)
    // For `singular(`, requires GraphQL-like arg after `(` to avoid false positives
    // on English text like "organization (RLS Block)"
    patterns.push({
      regex: new RegExp(
        `(?<![a-zA-Z_])${singular}(?:` +
          `\\s*\\{` + // `user {` (field selection)
          `|_by_pk` + // `user_by_pk`
          `|_aggregate` + // `user_aggregate`
          `|\\s*\\(\\s*(?:where|limit|offset|order_by|distinct_on|\\$)` + // `user(where:`, `user(limit:`, `user($var`
          `)(?!s)`,
      ),
      singular,
      correct,
      label,
      type: "query",
    });

    // Insert mutations: `insert_user_one`, `insert_user(`
    patterns.push({
      regex: new RegExp(`insert_${singular}(?:_one|\\s*\\()`),
      singular,
      correct,
      label,
      type: "insert",
    });

    // Update mutations: `update_user_by_pk`, `update_user(`
    patterns.push({
      regex: new RegExp(`update_${singular}(?:_by_pk|\\s*\\()`),
      singular,
      correct,
      label,
      type: "update",
    });

    // Delete mutations: `delete_user_by_pk`, `delete_user(`
    patterns.push({
      regex: new RegExp(`delete_${singular}(?:_by_pk|\\s*\\()`),
      singular,
      correct,
      label,
      type: "delete",
    });
  }

  return patterns;
}

const PATTERNS = buildPatterns();

const INLINE_GRAPHQL_EXEMPT_PATH_SEGMENTS = [
  "/.webpresso/generated/",
  "/packages/sdk/schema-engine/src/emitters/",
  "/packages/feature/app-core/src/daemon/",
];

function normalizeFilename(filename) {
  return typeof filename === "string" ? filename.replaceAll("\\", "/") : "";
}

function getFilename(context) {
  if (typeof context.getFilename === "function") {
    return normalizeFilename(context.getFilename());
  }

  return normalizeFilename(context.filename);
}

function isClientQuerySurface(filename) {
  const normalized = normalizeFilename(filename);
  if (!/\.tsx?$/.test(normalized)) return false;
  if (INLINE_GRAPHQL_EXEMPT_PATH_SEGMENTS.some((segment) => normalized.includes(segment))) {
    return false;
  }

  const isWebAppSurface = normalized.includes("/apps/web/") && normalized.includes("/app/");
  const isFeatureSurface =
    normalized.includes("/packages/feature/") && normalized.includes("/src/");

  return isWebAppSurface || isFeatureSurface;
}

function getNodeStart(node) {
  if (Array.isArray(node?.range) && typeof node.range[0] === "number") {
    return node.range[0];
  }

  return typeof node?.start === "number" ? node.start : null;
}

function isGraphqlCommentTagged(context, node) {
  const sourceText = context.sourceCode?.getText?.();
  const start = getNodeStart(node);
  if (typeof sourceText !== "string" || typeof start !== "number") {
    return false;
  }

  return /\/\*\s*GraphQL\s*\*\/\s*$/.test(sourceText.slice(Math.max(0, start - 40), start));
}

function isGqlTag(tag) {
  if (!tag) return false;
  if (tag.type === "Identifier") return tag.name === "gql";

  return (
    tag.type === "MemberExpression" &&
    !tag.computed &&
    tag.property?.type === "Identifier" &&
    tag.property.name === "gql"
  );
}

function checkStringForSingularFields(context, node, text) {
  // Quick pre-check: skip strings that don't look like GraphQL
  // GraphQL queries contain `{` or `query` or `mutation` or `subscription`
  if (
    !text.includes("{") &&
    !text.includes("query") &&
    !text.includes("mutation") &&
    !text.includes("subscription")
  ) {
    return;
  }

  for (const pattern of PATTERNS) {
    if (!pattern.regex.test(text)) continue;

    const correctedField =
      pattern.type === "query"
        ? pattern.correct
        : pattern.type === "insert"
          ? `insert_${pattern.correct}_one`
          : pattern.type === "update"
            ? `update_${pattern.correct}_by_pk`
            : `delete_${pattern.correct}_by_pk`;

    const matched = text.match(pattern.regex)?.[0] ?? `${pattern.singular}`;

    context.report({
      node,
      message:
        `Singular GraphQL field name '${matched}' — Hasura uses plural table names. ` +
        `Use '${correctedField}' instead. ` +
        `All tables use plural names (e.g., users, organizations, projects, members, meta_entities).`,
    });

    // Report only the first match per string to avoid noise
    return;
  }
}

const noSingularGraphqlFields = {
  create(context) {
    return {
      // Check template literals (most GraphQL queries use backticks)
      TemplateLiteral(node) {
        // Combine all quasis (static parts) of the template literal
        const text = node.quasis.map((q) => q.value?.raw ?? q.value?.cooked ?? "").join("");
        checkStringForSingularFields(context, node, text);
      },

      // Check regular string literals (some queries use single/double quotes)
      Literal(node) {
        if (typeof node.value !== "string") return;
        checkStringForSingularFields(context, node, node.value);
      },
    };
  },
};

const noInlineGraphqlInApp = {
  create(context) {
    if (!isClientQuerySurface(getFilename(context))) {
      return {};
    }

    function report(node) {
      context.report({
        node,
        message:
          "Inline GraphQL is banned in client query surfaces. Use generated SDK operations or shared query option factories instead.",
      });
    }

    return {
      TaggedTemplateExpression(node) {
        if (!isGqlTag(node.tag)) return;
        report(node);
      },
      TemplateLiteral(node) {
        if (node.parent?.type === "TaggedTemplateExpression") return;
        if (!isGraphqlCommentTagged(context, node)) return;
        report(node);
      },
    };
  },
};

const plugin = {
  meta: { name: "webpresso-graphql" },
  rules: {
    "no-singular-graphql-fields": noSingularGraphqlFields,
    "no-inline-graphql-in-app": noInlineGraphqlInApp,
  },
};

export default plugin;
