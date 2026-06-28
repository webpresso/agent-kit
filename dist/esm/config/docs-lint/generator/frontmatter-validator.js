/**
 * Creates a missing field error
 */
function createMissingFieldError(fieldName, fieldDef) {
    return {
        code: "MISSING_REQUIRED_FRONTMATTER",
        message: `Missing required frontmatter field '${fieldName}'`,
        field: fieldName,
        expected: fieldDef.description ?? "a value",
    };
}
/**
 * Validates a field value against an enum constraint
 */
function validateEnumValue(fieldName, value, enumValues) {
    if (!enumValues.includes(value)) {
        return {
            code: "INVALID_FRONTMATTER_VALUE",
            message: `Invalid value for '${fieldName}': '${value}'. Must be one of: ${enumValues.join(", ")}`,
            field: fieldName,
            expected: enumValues.join(", "),
            actual: value,
        };
    }
    return null;
}
/**
 * Validates a field value against a fixed value constraint
 */
function validateFixedValue(fieldName, value, expectedValue) {
    if (value !== expectedValue) {
        return {
            code: "INVALID_FRONTMATTER_VALUE",
            message: `Invalid value for '${fieldName}': '${value}'. Must be '${expectedValue}'`,
            field: fieldName,
            expected: expectedValue,
            actual: value,
        };
    }
    return null;
}
/**
 * Validates a single frontmatter field
 */
function validateField(fieldName, fieldDef, value) {
    if (value === undefined || value === null) {
        return createMissingFieldError(fieldName, fieldDef);
    }
    if (fieldDef.enum && typeof value === "string") {
        return validateEnumValue(fieldName, value, fieldDef.enum);
    }
    if (fieldDef.value && typeof value === "string") {
        return validateFixedValue(fieldName, value, fieldDef.value);
    }
    return null;
}
/**
 * Validates frontmatter against template schema
 */
export function validateFrontmatter(frontmatter, schema) {
    const errors = [];
    const requiredFields = schema.frontmatter?.required ?? {};
    for (const [fieldName, fieldDef] of Object.entries(requiredFields)) {
        const value = frontmatter[fieldName];
        const error = validateField(fieldName, fieldDef, value);
        if (error) {
            errors.push(error);
        }
    }
    return errors;
}
//# sourceMappingURL=frontmatter-validator.js.map