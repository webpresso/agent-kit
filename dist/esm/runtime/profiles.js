export const RUNTIME_PROFILES = [
    "none",
    "secrets-only",
    "service-runtime",
    "database",
    "full",
];
export const SECRET_BACKED_RUNTIME_PROFILES = [
    "secrets-only",
    "service-runtime",
    "database",
    "full",
];
export function isRuntimeProfile(value) {
    return RUNTIME_PROFILES.includes(value);
}
export function isDirectRuntimeProfile(value) {
    return value === "none" || value === "public";
}
export function needsSecretResolution(value) {
    return value === undefined || value === "" || value === "public" || value === "none"
        ? false
        : isRuntimeProfile(value);
}
//# sourceMappingURL=profiles.js.map