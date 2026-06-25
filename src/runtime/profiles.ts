export type RuntimeProfile = "none" | "secrets-only" | "service-runtime" | "database" | "full";

export const RUNTIME_PROFILES = [
  "none",
  "secrets-only",
  "service-runtime",
  "database",
  "full",
] as const satisfies readonly RuntimeProfile[];

export const SECRET_BACKED_RUNTIME_PROFILES = [
  "secrets-only",
  "service-runtime",
  "database",
  "full",
] as const satisfies readonly Exclude<RuntimeProfile, "none">[];

export function isRuntimeProfile(value: string | undefined): value is RuntimeProfile {
  return RUNTIME_PROFILES.includes(value as RuntimeProfile);
}

export function isDirectRuntimeProfile(value: string | undefined): boolean {
  return value === "none" || value === "public";
}

export function needsSecretResolution(value: string | undefined): boolean {
  return value === undefined || value === "" || value === "public" || value === "none"
    ? false
    : isRuntimeProfile(value);
}
