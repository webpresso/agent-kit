import * as jsYaml from "js-yaml";
import { getContent, getFilePath } from "#hooks/shared/types";
import { getNonCanonicalPlanningPathViolation, isBlueprintPath, isCanonicalBlueprintDocumentPath, } from "./path-contract.js";
import { createSkipResult } from "./skip-result.js";
// Keep aligned with webpresso/blueprint planStatusSchema + plan type enum.
const VALID_TYPES = ["blueprint", "parent-roadmap"];
const VALID_STATUSES = ["draft", "planned", "parked", "in-progress", "completed", "archived"];
const VALID_COMPLEXITIES = ["XS", "S", "M", "L", "XL"];
function shouldValidatePath(filePath) {
    const normalized = filePath.startsWith("/") ? filePath.slice(1) : filePath;
    const nonCanonicalPlanningPath = getNonCanonicalPlanningPathViolation(normalized);
    const currentPath = isBlueprintPath(normalized);
    const isCanonicalBlueprintDoc = isCanonicalBlueprintDocumentPath(normalized);
    return !nonCanonicalPlanningPath && currentPath && isCanonicalBlueprintDoc;
}
export function extractFrontmatterBlock(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    return match?.[1] ?? null;
}
export function parseFrontmatter(yamlBlock) {
    try {
        const result = jsYaml.load(yamlBlock);
        if (typeof result === "object" && result !== null)
            return result;
        return null;
    }
    catch {
        return null;
    }
}
function validateField(value, fieldName, validValues) {
    if (value === undefined)
        return { field: fieldName, message: `Missing required field: ${fieldName}` };
    if (typeof value !== "string" || !validValues.includes(value)) {
        return {
            field: fieldName,
            message: `Invalid ${fieldName}: "${value}". Valid values: ${validValues.join(", ")}`,
        };
    }
    return null;
}
export function collectFieldViolations(data) {
    const violations = [];
    const typeViolation = validateField(data.type, "type", VALID_TYPES);
    if (typeViolation)
        violations.push(typeViolation);
    const statusViolation = validateField(data.status, "status", VALID_STATUSES);
    if (statusViolation)
        violations.push(statusViolation);
    const complexityViolation = validateField(data.complexity, "complexity", VALID_COMPLEXITIES);
    if (complexityViolation)
        violations.push(complexityViolation);
    return violations;
}
export function countTaskHeadings(content) {
    return content.match(/^####\s+Task\s+\d+(?:\.\d+)+:/gm)?.length ?? 0;
}
export function detectWrongTaskFormat(content) {
    return content.match(/^###\s+Task\s+\d+(?:\.\d+)+:/gm)?.length ?? 0;
}
export function validatePlanFrontmatter(input) {
    const filePath = getFilePath(input);
    if (process.env.PLAN_FRONTMATTER_SKIP === "1")
        return createSkipResult("plan-frontmatter");
    if (!filePath || !shouldValidatePath(filePath)) {
        if (filePath) {
            const planningPathViolation = getNonCanonicalPlanningPathViolation(filePath);
            if (planningPathViolation)
                return { validator: "plan-frontmatter", passed: false, message: planningPathViolation };
        }
        return { validator: "plan-frontmatter", passed: true };
    }
    if (input.tool_input?.old_string !== undefined)
        return { validator: "plan-frontmatter", passed: true };
    const content = getContent(input);
    if (!content)
        return { validator: "plan-frontmatter", passed: true };
    const yamlBlock = extractFrontmatterBlock(content);
    if (!yamlBlock) {
        return {
            validator: "plan-frontmatter",
            passed: false,
            message: "Missing YAML frontmatter block (expected --- at start of file)",
        };
    }
    const data = parseFrontmatter(yamlBlock);
    if (!data) {
        return {
            validator: "plan-frontmatter",
            passed: false,
            message: "Invalid YAML in frontmatter block",
        };
    }
    const violations = [...collectFieldViolations(data)];
    const wrongFormatCount = detectWrongTaskFormat(content);
    if (wrongFormatCount > 0) {
        violations.push({
            field: "task_format",
            message: `Found ${wrongFormatCount} task heading(s) with wrong format (use "#### Task X.Y:" not "### Task X.Y:")`,
        });
    }
    if (violations.length > 0) {
        const preview = violations.slice(0, 4).map((v) => `  ${v.field}: ${v.message}`);
        const overflow = violations.length > 4 ? `\n  ...and ${violations.length - 4} more issues` : "";
        return {
            validator: "plan-frontmatter",
            passed: false,
            message: `Blueprint validation failed:\n${preview.join("\n")}${overflow}`,
        };
    }
    const taskCount = countTaskHeadings(content);
    if (taskCount === 0) {
        return {
            validator: "plan-frontmatter",
            passed: true,
            message: 'Warning: no task headings found (expected "#### Task X.Y:" format)',
        };
    }
    return { validator: "plan-frontmatter", passed: true };
}
//# sourceMappingURL=plan-frontmatter.js.map