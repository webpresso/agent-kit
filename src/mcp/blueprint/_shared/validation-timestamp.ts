import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const VALIDATE_TS_FILE = ".validate-timestamps.json";

export const vtPath = (cwd: string) => path.join(cwd, ".agent", VALIDATE_TS_FILE);

export function readVt(cwd: string): Record<string, number> {
  try {
    return JSON.parse(readFileSync(vtPath(cwd), "utf8")) as Record<string, number>;
  } catch {
    return {};
  }
}

export function writeVt(cwd: string, d: Record<string, number>): void {
  mkdirSync(path.dirname(vtPath(cwd)), { recursive: true });
  writeFileSync(vtPath(cwd), JSON.stringify(d, null, 2), "utf8");
}
