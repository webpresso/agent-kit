/**
 * Tracked Document Parser Utilities
 *
 * Pure functions for parsing markdown documents with checkbox-based task tracking.
 * Shared across Blueprint and TechDebt parsers.
 *
 * Git-Native SSoT: Checkbox state derives status, no external state.
 */
import { isTaskHeaderLine } from '#markdown/task-heading';
/**
 * Extract checkbox status from a markdown section and derive task state.
 *
 * Status derivation rules (Git-Native SSoT):
 * - 0 checkboxes = pending (no acceptance criteria defined yet)
 * - all checked = completed
 * - some checked = running
 * - none checked = pending
 *
 * @param section - Markdown section containing checkboxes
 * @returns Checkbox counts and derived status
 *
 * @example
 * ```typescript
 * const section = `
 * #### Task 1.1: Setup
 * - [x] Install dependencies
 * - [ ] Configure environment
 * `
 * const { total, checked, status } = extractCheckboxStatus(section)
 * // { total: 2, checked: 1, status: 'running' }
 * ```
 */
export function extractCheckboxStatus(section) {
    const checkboxRegex = /^- \[([ x])\]/gm;
    const matches = Array.from(section.matchAll(checkboxRegex));
    const total = matches.length;
    const checked = matches.filter((m) => m[1] === 'x').length;
    // Derive status from checkbox state (Git-Native SSoT)
    let status = 'todo';
    if (total > 0) {
        if (checked === total) {
            status = 'done';
        }
        else if (checked > 0) {
            status = 'in_progress';
        }
    }
    return { total, checked, status };
}
/**
 * Extract acceptance criteria (checkbox counts only, without status)
 *
 * @param section - Markdown section containing checkboxes
 * @returns Checkbox counts
 */
export function extractAcceptanceCriteria(section) {
    const { total, checked } = extractCheckboxStatus(section);
    return { total, checked };
}
/**
 * Extract dependency task IDs from a "Depends:" metadata line
 *
 * Supports multiple formats:
 * - "Task 1.1, Task 1.2" (explicit prefix each)
 * - "Tasks 1.1, 1.2, 1.3" (plural prefix, bare IDs after)
 * - "1.1, 1.2" (bare IDs)
 * - "None" (returns empty array)
 *
 * @param section - Markdown section containing metadata
 * @returns Array of task IDs (e.g., ["1.1", "1.2"])
 *
 * @example
 * ```typescript
 * const section = "**Depends:** Tasks 1.1, 1.2"
 * extractDepends(section) // ["1.1", "1.2"]
 * ```
 */
export function extractDepends(section) {
    const dependsMatch = section.match(/\*\*Depends:\*\*\s*(.+)/i);
    if (!dependsMatch?.[1])
        return [];
    const dependsText = dependsMatch[1].trim();
    if (dependsText.toLowerCase() === 'none')
        return [];
    // Extract task IDs from various formats
    const taskIdRegex = /(?:Tasks?\s+)?(\d+(?:\.\d+)+)/gi;
    const ids = Array.from(dependsText.matchAll(taskIdRegex), (m) => m[1] ?? '');
    return ids.filter((id) => id !== '');
}
/**
 * Extract blocked reason from a "Blocked:" metadata line
 *
 * @param section - Markdown section containing metadata
 * @returns Blocked reason text, or undefined if not blocked
 *
 * @example
 * ```typescript
 * const section = "**Blocked:** Waiting for API approval"
 * extractBlocked(section) // "Waiting for API approval"
 * ```
 */
export function extractBlocked(section) {
    const blockedMatch = section.match(/\*\*Blocked:\*\*\s*(.+)/i);
    if (!blockedMatch?.[1])
        return undefined;
    const blockedText = blockedMatch[1].trim();
    // Handle missing/empty reason gracefully
    if (blockedText === '' || blockedText.toLowerCase() === 'none') {
        return undefined;
    }
    return blockedText;
}
/**
 * Find the end index of a task section.
 *
 * Task section ends at the next task header OR at a major section delimiter (## or ---).
 * This prevents including checkboxes from other sections like Success Criteria.
 *
 * @param content - Full markdown content
 * @param taskStart - Start index of current task
 * @param nextTaskIndex - Start index of next task (or content.length)
 * @returns End index of task section
 */
export function findTaskSectionEnd(content, taskStart, nextTaskIndex) {
    const contentAfterTask = content.slice(taskStart);
    const sectionDelimiterMatch = contentAfterTask.match(/\n(?:##\s|---\n)/);
    const sectionDelimiterIndex = sectionDelimiterMatch
        ? taskStart + (sectionDelimiterMatch.index ?? content.length) + 1
        : content.length;
    return Math.min(nextTaskIndex, sectionDelimiterIndex);
}
/**
 * Extract plain text description from a task section.
 *
 * Excludes:
 * - Task header line
 * - Metadata lines (Depends, Blocked, Status)
 * - Checklist items
 * - Leading empty lines
 *
 * @param section - Task section content
 * @returns Description text, or undefined if no description
 */
export function extractTaskDescription(section) {
    const lines = section.split('\n');
    const descriptionLines = [];
    let inDescription = false;
    for (const line of lines) {
        // Skip task header
        if (isTaskHeader(line)) {
            inDescription = true;
            continue;
        }
        // Skip lines until we're in description
        if (shouldSkipLine(line, inDescription, descriptionLines.length)) {
            continue;
        }
        descriptionLines.push(line);
    }
    const description = descriptionLines.join('\n').trim();
    return description.length > 0 ? description : undefined;
}
/**
 * Check if line is a task header using the shared strict blueprint grammar.
 */
function isTaskHeader(line) {
    return isTaskHeaderLine(line);
}
/**
 * Check if line is a metadata field (Depends, Blocked, Status)
 */
function isMetadataLine(line) {
    return /^\*\*(Depends|Blocked|Status):\*\*/i.test(line);
}
/**
 * Check if line is a checklist item
 */
function isChecklistItem(line) {
    return /^-\s*\[([ x])\]/.test(line);
}
/**
 * Determine if a line should be skipped during description extraction
 */
function shouldSkipLine(line, inDescription, collectedCount) {
    if (isTaskHeader(line))
        return true;
    if (isMetadataLine(line))
        return true;
    if (isChecklistItem(line))
        return true;
    if (!inDescription)
        return true;
    if (line.trim() === '' && collectedCount === 0)
        return true;
    return false;
}
//# sourceMappingURL=parser.js.map