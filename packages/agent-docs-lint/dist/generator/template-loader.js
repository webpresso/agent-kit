import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRootDir = resolve(__dirname, '../..');
/**
 * Resolves the templates directory path
 */
function getTemplatesDir() {
    return resolve(packageRootDir, 'templates');
}
/**
 * Loads a template schema from templates/{name}.yaml
 */
export function loadTemplate(templateName) {
    const templatesDir = getTemplatesDir();
    const templatePath = resolve(templatesDir, `${templateName}.yaml`);
    if (!existsSync(templatePath)) {
        return {
            success: false,
            errors: [
                {
                    code: 'TEMPLATE_NOT_FOUND',
                    message: `Template '${templateName}' not found at ${templatePath}. Available templates are in templates/`,
                    field: 'template',
                    expected: 'valid template name',
                    actual: templateName,
                },
            ],
        };
    }
    try {
        const content = readFileSync(templatePath, 'utf-8');
        const schema = parseYaml(content);
        return {
            success: true,
            schema,
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            success: false,
            errors: [
                {
                    code: 'TEMPLATE_PARSE_ERROR',
                    message: `Failed to parse template '${templateName}': ${message}`,
                    field: 'template',
                },
            ],
        };
    }
}
/**
 * Gets list of available template names
 */
export function getAvailableTemplates() {
    const templatesDir = getTemplatesDir();
    if (!existsSync(templatesDir)) {
        return [];
    }
    const files = readdirSync(templatesDir);
    return files.filter((f) => f.endsWith('.yaml')).map((f) => f.replace('.yaml', ''));
}
