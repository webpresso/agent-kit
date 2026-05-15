import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { glob } from 'glob';
import matter from 'gray-matter';
import { agentFrontmatterSchema, commandFrontmatterSchema, skillFrontmatterSchema, } from './schema.js';
/** Warn on validation failure without throwing — keeps flatten non-fatal. */
function validateFrontmatter(schema, data, filePath) {
    const result = schema.safeParse(data);
    if (!result.success) {
        process.stderr.write(`ak-compiler: frontmatter validation warning for ${filePath}: ${result.error?.message ?? 'unknown error'}\n`);
    }
}
/** Reads a file as utf-8 string and parses its gray-matter frontmatter. */
function readAndParse(filePath) {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = matter(raw);
    return { data: parsed.data, raw };
}
/** Reads `.agent/{skills,commands,agents}/` and returns an in-memory flattened structure. */
export function flattenAgentDir(agentDir) {
    const skills = {};
    const commands = {};
    const agents = {};
    // Skills: .agent/skills/<name>/SKILL.md — key is the directory name
    const skillFiles = glob.sync('skills/*/SKILL.md', { cwd: agentDir, absolute: true });
    for (const filePath of skillFiles) {
        const { data, raw } = readAndParse(filePath);
        validateFrontmatter(skillFrontmatterSchema, data, filePath);
        // Extract skill name from path: .agent/skills/<name>/SKILL.md
        const parts = filePath.split('/');
        const skillIdx = parts.lastIndexOf('skills');
        const name = (skillIdx !== -1 ? parts[skillIdx + 1] : undefined) ?? 'unknown';
        skills[name] = raw;
    }
    // Commands: .agent/commands/<name>.md — key is the file stem
    const commandFiles = glob.sync('commands/*.md', { cwd: agentDir, absolute: true });
    for (const filePath of commandFiles) {
        const { data, raw } = readAndParse(filePath);
        validateFrontmatter(commandFrontmatterSchema, data, filePath);
        const fileName = filePath.split('/').pop() ?? '';
        const name = fileName.replace(/\.md$/, '');
        commands[name] = raw;
    }
    // Agents: .agent/agents/<name>.md — key is the file stem
    const agentFiles = glob.sync('agents/*.md', { cwd: agentDir, absolute: true });
    for (const filePath of agentFiles) {
        const { data, raw } = readAndParse(filePath);
        validateFrontmatter(agentFrontmatterSchema, data, filePath);
        const fileName = filePath.split('/').pop() ?? '';
        const name = fileName.replace(/\.md$/, '');
        agents[name] = raw;
    }
    return { skills, commands, agents };
}
/** Writes flattened assets to a directory structure mirroring rulesync's expected layout. */
export async function writeFlattenedAssets(assets, outDir) {
    const subdirs = ['skills', 'commands', 'agents'];
    for (const sub of subdirs) {
        mkdirSync(join(outDir, sub), { recursive: true });
    }
    for (const [name, content] of Object.entries(assets.skills)) {
        writeFileSync(join(outDir, 'skills', `${name}.md`), content);
    }
    for (const [name, content] of Object.entries(assets.commands)) {
        writeFileSync(join(outDir, 'commands', `${name}.md`), content);
    }
    for (const [name, content] of Object.entries(assets.agents)) {
        writeFileSync(join(outDir, 'agents', `${name}.md`), content);
    }
}
//# sourceMappingURL=flatten.js.map