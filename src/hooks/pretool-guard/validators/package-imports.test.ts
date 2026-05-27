import { describe, expect, it } from 'vitest'

import { validatePackageImports } from './package-imports'

const writeInput = (filePath: string, content: string) => ({
  tool_input: { file_path: filePath, content },
})

describe('validatePackageImports', () => {
  it('keeps the generic default profile free of Webpresso-specific package advice', () => {
    const result = validatePackageImports(
      writeInput(
        '/repo/src/utils/capitalize.ts',
        'export function capitalize(str: string) { return str.toUpperCase() }',
      ),
    )

    expect(result).toEqual({ validator: 'package-imports', passed: true })
  })

  it('surfaces Webpresso-specific package advice only through the explicit webpresso profile', () => {
    const result = validatePackageImports(
      writeInput(
        '/repo/src/utils/capitalize.ts',
        'export function capitalize(str: string) { return str.toUpperCase() }',
      ),
      { profile: 'webpresso' },
    )

    expect(result.passed).toBe(false)
    expect(result).toMatchObject({
      validator: 'package-imports',
      functionName: 'capitalize',
      package: '@webpresso/webpresso',
      source: 'runtime/format/string',
    })
  })
})
