import type { TemplateSchema, ValidationError } from './types.js'

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'

function findTemplatesRoot(startDir: string): string {
  let current = resolve(startDir)
  for (;;) {
    if (existsSync(join(current, 'templates'))) return current
    const parent = dirname(current)
    if (parent === current) {
      throw new Error(`Could not find docs-lint templates root from: ${startDir}`)
    }
    current = parent
  }
}

/**
 * Resolves the templates directory path
 */
function getTemplatesDir(): string {
  return join(findTemplatesRoot(import.meta.dirname), 'templates')
}

/**
 * Result of loading a template
 */
export interface LoadTemplateResult {
  success: boolean
  schema?: TemplateSchema
  errors?: ValidationError[]
}

/**
 * Loads a template schema from templates/{name}.yaml
 */
export function loadTemplate(templateName: string): LoadTemplateResult {
  const templatesDir = getTemplatesDir()
  const templatePath = resolve(templatesDir, `${templateName}.yaml`)

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
    }
  }

  try {
    const content = readFileSync(templatePath, 'utf-8')
    const schema = parseYaml(content) as TemplateSchema
    return {
      success: true,
      schema,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      errors: [
        {
          code: 'TEMPLATE_PARSE_ERROR',
          message: `Failed to parse template '${templateName}': ${message}`,
          field: 'template',
        },
      ],
    }
  }
}

/**
 * Gets list of available template names
 */
export function getAvailableTemplates(): string[] {
  const templatesDir = getTemplatesDir()
  if (!existsSync(templatesDir)) {
    return []
  }

  const files = readdirSync(templatesDir) as string[]
  return files.filter((f: string) => f.endsWith('.yaml')).map((f: string) => f.replace('.yaml', ''))
}
