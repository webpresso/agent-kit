/**
 * Verification block markdown helper.
 *
 * Owns three responsibilities, in order:
 *
 * 1. **Validate** caller-supplied evidence against the Evidence Contract
 *    (see `./evidence.ts`). Trivial payloads, empty lists, and any evidence
 *    item with `result === 'fail'` reject the transition without touching
 *    markdown.
 * 2. **Serialize** the canonicalized evidence into a stable markdown block
 *    rooted under a fixed canonical header (`VERIFICATION_BLOCK_HEADER`).
 *    The stable header is the anti-forgery anchor: future re-ingests can
 *    detect tampering by re-canonicalizing and comparing.
 * 3. **Edit** the blueprint `_overview.md` in-place (read → edit → write)
 *    atomically and then trigger a re-ingest of the projection DB.
 *
 * This module is consumed by `wp_blueprint_task_verify` (Task 3.2). It does
 * not register MCP tools and has no transitive MCP dependency.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { escapeRegex } from '#utils/string';
import { canonicalizeEvidenceList, evidenceListSchema } from './evidence.js';
import { completeTask } from './markdown/helpers.js';
import { buildTaskHeaderRegexForId, buildTaskSectionBoundaryRegex, TASK_HEADING_PREFIX_PATTERN, } from './markdown/task-heading.js';
/**
 * Canonical header used to anchor the verification block under a task.
 *
 * Stability of this string is part of the contract — re-ingest, audits,
 * and tamper-detection all rely on grep-able presence. Do not change
 * casing or punctuation without a migration plan.
 */
export const VERIFICATION_BLOCK_HEADER = '**Verification:**';
const VERIFICATION_FENCE_LANG = 'webpresso-evidence-v1';
const VERIFICATION_BLOCK_PATTERN = new RegExp(`\\n*${escapeRegex(VERIFICATION_BLOCK_HEADER)}\\n+\`\`\`${VERIFICATION_FENCE_LANG}\\n[\\s\\S]*?\\n\`\`\`\\n*`, 'g');
/**
 * Apply an evidence list to a blueprint markdown buffer. Pure function — does
 * not touch the filesystem.
 *
 * On success: returns the rewritten markdown with the canonical verification
 * block inserted under the target task and the task status set to `done`.
 *
 * On failure: returns `next_action: 'verify_task'` with a structured failure
 * list. Markdown is NOT modified on failure.
 */
export function applyVerification(markdown, taskId, evidence) {
    const parsed = evidenceListSchema.safeParse(evidence);
    if (!parsed.success) {
        return failure(parsed.error.issues.map((issue) => formatZodIssue(issue)));
    }
    const items = parsed.data;
    const failingItems = items.filter((item) => item.result === 'fail');
    if (failingItems.length > 0) {
        return failure(failingItems.map((item, idx) => `evidence[${idx}] (kind=${item.kind}) has result: 'fail' — cannot transition to done`));
    }
    const passing = items.filter((item) => item.result === 'pass');
    if (passing.length === 0) {
        return failure(['evidence list contains zero passing items']);
    }
    const taskHeader = buildTaskHeaderRegexForId(taskId);
    if (!taskHeader.test(markdown)) {
        return failure([`task ${taskId} not found in blueprint markdown`]);
    }
    const block = serializeVerificationBlock(items);
    // Replace any existing verification block inside the target task region
    // BEFORE we mutate status so we cleanly replace rather than append.
    const withoutExistingBlock = removeVerificationFromTask(markdown, taskId);
    // Reuse the canonical task-completion mutation so verification and lifecycle
    // completion cannot drift on status / blocked-state / acceptance behavior.
    const withStatus = completeTask(withoutExistingBlock, taskId);
    // Insert the canonical block immediately after the status line of the
    // target task.
    const withBlock = insertVerificationAfterStatus(withStatus, taskId, block);
    return { ok: true, markdown: withBlock, status: 'done' };
}
/**
 * Filesystem-backed wrapper around {@link applyVerification}.
 *
 * Reads the blueprint markdown, applies the verification, writes the result
 * back, and triggers a re-ingest via the injected callback so the SQLite
 * projection reflects the new state immediately.
 *
 * On failure, neither the file nor the projection is touched.
 *
 * Idempotency: re-applying the same canonical evidence produces the same
 * bytes; the file write is a no-op semantically, and the re-ingest call
 * remains fast because the underlying ingester is hash-aware.
 */
export async function writeVerification(options) {
    const { filePath, taskId, evidence, cwd, reingest } = options;
    const markdown = await readFile(filePath, 'utf8');
    const result = applyVerification(markdown, taskId, evidence);
    if (!result.ok) {
        return result;
    }
    if (result.markdown !== markdown) {
        await writeFile(filePath, result.markdown, 'utf8');
    }
    await reingest({ cwd });
    return result;
}
/**
 * Serialize evidence to the canonical markdown block.
 *
 * Format:
 *
 * ```text
 * **Verification:**
 *
 * ```webpresso-evidence-v1
 * [<canonical-json-evidence-array>]
 * ```
 * ```
 *
 * The fenced block uses a custom language tag (`webpresso-evidence-v1`) so
 * future versions can introduce parallel formats without conflicting with
 * existing tools' fence-language detection.
 */
export function serializeVerificationBlock(evidence) {
    const json = canonicalizeEvidenceList(evidence);
    return `${VERIFICATION_BLOCK_HEADER}\n\n\`\`\`${VERIFICATION_FENCE_LANG}\n${json}\n\`\`\``;
}
/**
 * Parse evidence back out of a canonical verification block.
 *
 * Returns the parsed (and zod-validated) evidence list, or `null` if the
 * block is missing, malformed, or contains evidence that no longer satisfies
 * the Evidence Contract (which would indicate tampering).
 */
export function parseVerificationBlock(block) {
    const pattern = new RegExp(`${escapeRegex(VERIFICATION_BLOCK_HEADER)}\\s*\\n+\`\`\`${VERIFICATION_FENCE_LANG}\\n([\\s\\S]*?)\\n\`\`\``, 'm');
    const match = block.match(pattern);
    if (!match)
        return null;
    const jsonText = match[1];
    if (jsonText === undefined)
        return null;
    let raw;
    try {
        raw = JSON.parse(jsonText);
    }
    catch {
        return null;
    }
    const parsed = evidenceListSchema.safeParse(raw);
    if (!parsed.success)
        return null;
    return parsed.data;
}
// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------
function failure(failures) {
    return { ok: false, next_action: 'verify_task', failures };
}
function formatZodIssue(issue) {
    const path = issue.path.length > 0 ? issue.path.map(String).join('.') : '(root)';
    return `${path}: ${issue.message}`;
}
function removeVerificationFromTask(markdown, taskId) {
    return mapTaskSection(markdown, taskId, (section) => {
        return section.replace(VERIFICATION_BLOCK_PATTERN, '\n\n').replace(/\n{3,}/g, '\n\n');
    });
}
function insertVerificationAfterStatus(markdown, taskId, block) {
    return mapTaskSection(markdown, taskId, (section) => {
        const statusMatch = section.match(/(\*\*Status:\*\*\s*.+\n+)/i);
        if (!statusMatch || statusMatch.index === undefined) {
            // Fallback: append after the heading line.
            const headingMatch = section.match(new RegExp(`(####\\s+${TASK_HEADING_PREFIX_PATTERN}Task\\s+[^\\n]+\\n+)`));
            if (!headingMatch) {
                return `${section}\n\n${block}\n`;
            }
            return section.replace(headingMatch[0], `${headingMatch[0]}${block}\n\n`);
        }
        return section.replace(statusMatch[0], `${statusMatch[0]}${block}\n\n`);
    });
}
/**
 * Apply a transform to the section of `markdown` covering the task with
 * `taskId` (from its `#### Task X.Y:` heading to the next task or phase
 * boundary). Sections outside the target task are returned unchanged.
 */
function mapTaskSection(markdown, taskId, transform) {
    const headerPattern = buildTaskHeaderRegexForId(taskId);
    const headerMatch = markdown.match(headerPattern);
    if (!headerMatch || headerMatch.index === undefined)
        return markdown;
    const startIndex = headerMatch.index;
    const restOfContent = markdown.slice(startIndex + headerMatch[0].length);
    const nextSectionMatch = restOfContent.match(buildTaskSectionBoundaryRegex());
    const endIndex = nextSectionMatch?.index
        ? startIndex + headerMatch[0].length + nextSectionMatch.index
        : markdown.length;
    const before = markdown.slice(0, startIndex);
    const section = markdown.slice(startIndex, endIndex);
    const after = markdown.slice(endIndex);
    return `${before}${transform(section)}${after}`;
}
//# sourceMappingURL=verification.js.map