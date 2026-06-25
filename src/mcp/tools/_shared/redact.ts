const KEY_PATTERNS = [
  /\b(?:GH_PACKAGES_TOKEN|GITHUB_TOKEN|GITHUB_PAT|NEON_API_KEY(?:_PLATFORM)?|CHEF_CI_TOKEN)\b\s*=\s*([^\s]+)/giu,
];

const TOKEN_PATTERNS = [
  /\bghp_[A-Za-z0-9]{20,}\b/gu,
  /\b(?:cf|sk|tok)_[A-Za-z0-9_-]{16,}\b/gu,
  /\b[A-Za-z0-9+/_-]{40,}\b/gu,
];

export function redactText(value: string | undefined): string | undefined {
  if (!value) return value;
  let output = value;
  for (const pattern of KEY_PATTERNS) {
    output = output.replace(pattern, (whole, token) => {
      const trimmed = String(token ?? "").trim();
      return whole.includes("=") ? whole.replace(trimmed, mask(trimmed)) : mask(trimmed);
    });
  }
  for (const pattern of TOKEN_PATTERNS) {
    output = output.replace(pattern, (token) => mask(token));
  }
  return output;
}

function mask(value: string): string {
  if (value.length <= 6) return "[REDACTED]";
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}
