import { describe, expect, it, vi } from 'vitest'

import { createValidatorDeps } from '#cli/factories'

import { ValidateCommand } from './validate-command'

type UnknownFn = (...args: unknown[]) => unknown
type AsyncUnknownFn = (...args: unknown[]) => Promise<unknown>

describe('ValidateCommand', () => {
  describe('run', () => {
    it('should return exit code 0 for valid documents', async () => {
      // Arrange
      const deps = createValidatorDeps({
        glob: ['/fake/cwd/README.md'],
        fs: {
          readFile: vi.fn<AsyncUnknownFn>().mockResolvedValue('---\ntype: guide\n---\n# Title'),
        },
      })
      const cmd = new ValidateCommand(deps)

      // Act
      const exitCode = await cmd.run({ files: ['README.md'] })

      // Assert
      expect(exitCode).toBe(0)
      expect(deps.logger.success).toHaveBeenCalledWith('All documents are valid')
    })

    it('should return exit code 1 for invalid blueprint frontmatter status', async () => {
      // Arrange — status must be a canonical blueprint lifecycle value
      const deps = createValidatorDeps({
        glob: ['/fake/cwd/webpresso/blueprints/test.md'],
        fs: {
          readFile: vi
            .fn<AsyncUnknownFn>()
            .mockResolvedValue('---\ntype: blueprint\nstatus: invalid-status\n---\n# Title'),
        },
      })
      const cmd = new ValidateCommand(deps)

      // Act
      const exitCode = await cmd.run({ files: ['webpresso/blueprints/test.md'] })

      // Assert
      expect(exitCode).toBe(1)
    })

    it('should hard-fail non-canonical planning markdown paths', async () => {
      const deps = createValidatorDeps({
        glob: ['/fake/cwd/platform/blueprints/test.md'],
      })
      const cmd = new ValidateCommand(deps)

      const exitCode = await cmd.run({ files: ['platform/blueprints/test.md'] })

      expect(exitCode).toBe(1)
      expect(deps.logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Planning markdown must live under'),
      )
    })

    it('should return exit code 1 for invalid decision frontmatter', async () => {
      // Arrange - decision without required 'decision' field should fail
      const deps = createValidatorDeps({
        glob: ['/fake/cwd/docs/decisions/test.md'],
        fs: {
          readFile: vi
            .fn<AsyncUnknownFn>()
            .mockResolvedValue(
              '---\ntype: decision\nstatus: accepted\ndate: 2026-01-01\n---\n# Title',
            ),
        },
      })
      const cmd = new ValidateCommand(deps)

      // Act
      const exitCode = await cmd.run({ files: ['docs/decisions/test.md'] })

      // Assert
      expect(exitCode).toBe(1) // Missing required 'decision' field
    })

    it('should call git diff when --staged flag is set', async () => {
      // Arrange
      const execSyncMock = vi.fn<UnknownFn>().mockReturnValue('docs/test.md\ndocs/another.md\n')
      const deps = createValidatorDeps({
        process: {
          execSync: execSyncMock,
        },
        fs: {
          readFile: vi.fn<AsyncUnknownFn>().mockResolvedValue('---\ntype: guide\n---\n# Title'),
        },
      })
      const cmd = new ValidateCommand(deps)

      // Act
      await cmd.run({ staged: true })

      // Assert
      expect(execSyncMock).toHaveBeenCalledWith(
        'git diff --cached --name-only --diff-filter=ACM',
        expect.objectContaining({ encoding: 'utf-8' }),
      )
    })

    it('should log file count when --verbose flag is set', async () => {
      // Arrange
      const deps = createValidatorDeps({
        glob: ['/fake/cwd/test1.md', '/fake/cwd/test2.md'],
        fs: {
          readFile: vi.fn<AsyncUnknownFn>().mockResolvedValue('---\ntype: guide\n---\n# Title'),
        },
      })
      const cmd = new ValidateCommand(deps)

      // Act
      await cmd.run({ verbose: true })

      // Assert
      expect(deps.logger.info).toHaveBeenCalledWith('Found 2 file(s) to validate')
    })

    it('should handle file read errors gracefully', async () => {
      // Arrange
      const deps = createValidatorDeps({
        glob: ['/fake/cwd/error.md'],
        fs: {
          readFile: vi.fn<AsyncUnknownFn>().mockRejectedValue(new Error('ENOENT: File not found')),
        },
      })
      const cmd = new ValidateCommand(deps)

      // Act
      const exitCode = await cmd.run({ files: ['error.md'] })

      // Assert
      expect(exitCode).toBe(1)
      expect(deps.logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to read file'))
    })

    it('should return early with exit code 0 when file list is empty', async () => {
      // Arrange
      const deps = createValidatorDeps({
        glob: [],
      })
      const cmd = new ValidateCommand(deps)

      // Act
      const exitCode = await cmd.run({})

      // Assert
      expect(exitCode).toBe(0)
      expect(deps.logger.info).toHaveBeenCalledWith('No files to validate')
    })

    it('should allow guides without frontmatter (simplified types)', async () => {
      // Arrange - guides (and most doc types) now allow optional frontmatter
      const deps = createValidatorDeps({
        glob: ['/fake/cwd/docs/how-to/test.md'],
        fs: {
          readFile: vi
            .fn<AsyncUnknownFn>()
            .mockResolvedValue('# No frontmatter here - just a guide'),
        },
      })
      const cmd = new ValidateCommand(deps)

      // Act
      const exitCode = await cmd.run({ files: ['docs/how-to/test.md'] })

      // Assert
      expect(exitCode).toBe(0) // Guides allow optional frontmatter
    })

    it('should not fail validation when only warnings exist', async () => {
      // Arrange
      const deps = createValidatorDeps({
        glob: ['/fake/cwd/test.md'],
        fs: {
          readFile: vi
            .fn<AsyncUnknownFn>()
            .mockResolvedValue(
              '---\ntype: guide\n---\n# Title\n\nVery long content that might trigger warnings...',
            ),
        },
      })
      const cmd = new ValidateCommand(deps)

      // Act
      const exitCode = await cmd.run({ files: ['test.md'] })

      // Assert
      expect(exitCode).toBe(0)
    })

    it('should validate multiple files', async () => {
      // Arrange
      const deps = createValidatorDeps({
        glob: ['/fake/cwd/test1.md', '/fake/cwd/test2.md'],
        fs: {
          readFile: vi.fn<AsyncUnknownFn>().mockResolvedValue('---\ntype: guide\n---\n# Title'),
        },
      })
      const cmd = new ValidateCommand(deps)

      // Act
      await cmd.run({ files: ['test1.md', 'test2.md'] })

      // Assert
      expect(deps.fs.readFile).toHaveBeenCalledTimes(2)
    })

    it('should call logger.info at beginning of validation', async () => {
      // Arrange
      const deps = createValidatorDeps({
        glob: ['/fake/cwd/test.md'],
        fs: {
          readFile: vi.fn<AsyncUnknownFn>().mockResolvedValue('---\ntype: guide\n---\n# Title'),
        },
      })
      const cmd = new ValidateCommand(deps)

      // Act
      await cmd.run({ files: ['test.md'] })

      // Assert
      expect(deps.logger.info).toHaveBeenCalledWith('Validating documentation...')
    })

    it('should use process.cwd() for relative paths', async () => {
      // Arrange
      const cwdMock = vi.fn<UnknownFn>().mockReturnValue('/custom/working/dir')
      const deps = createValidatorDeps({
        glob: ['/custom/working/dir/test.md'],
        process: {
          cwd: cwdMock,
        },
        fs: {
          readFile: vi.fn<AsyncUnknownFn>().mockResolvedValue('---\ntype: guide\n---\n# Title'),
        },
      })
      const cmd = new ValidateCommand(deps)

      // Act
      await cmd.run({ files: ['test.md'] })

      // Assert
      expect(cwdMock).toHaveBeenCalledTimes(4)
    })

    it('should call glob with correct patterns when no files specified', async () => {
      // Arrange
      const globMock = vi.fn<AsyncUnknownFn>().mockResolvedValue([])
      const deps = createValidatorDeps({
        glob: [],
      })
      deps.glob = globMock
      const cmd = new ValidateCommand(deps)

      // Act
      await cmd.run({})

      // Assert
      expect(globMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          'docs/**/*.md',
          '.agent/**/*.md',
          '.windsurf/**/*.md',
          'webpresso/blueprints/**/*.md',
          'CLAUDE.md',
          'README.md',
        ]),
        expect.objectContaining({
          ignore: expect.arrayContaining(['**/node_modules/**', '**/dist/**', '**/.git/**']),
        }),
      )
    })

    it('should call execSync for --staged with correct command', async () => {
      // Arrange
      const execSyncMock = vi.fn<UnknownFn>().mockReturnValue('')
      const deps = createValidatorDeps({
        process: {
          execSync: execSyncMock,
        },
      })
      const cmd = new ValidateCommand(deps)

      // Act
      await cmd.run({ staged: true })

      // Assert
      expect(execSyncMock).toHaveBeenCalledWith(
        'git diff --cached --name-only --diff-filter=ACM',
        expect.any(Object),
      )
    })

    it('should log debug info when verbose is enabled', async () => {
      // Arrange
      const deps = createValidatorDeps({
        glob: ['/fake/cwd/test.md'],
        fs: {
          readFile: vi.fn<AsyncUnknownFn>().mockResolvedValue('---\ntype: guide\n---\n# Title'),
        },
      })
      const cmd = new ValidateCommand(deps)

      // Act
      await cmd.run({ files: ['test.md'], verbose: true })

      // Assert
      expect(deps.logger.debug).toHaveBeenCalledWith(expect.stringContaining('type='))
    })

    it('should handle empty staged files list', async () => {
      // Arrange
      const execSyncMock = vi.fn<UnknownFn>().mockReturnValue('')
      const deps = createValidatorDeps({
        process: {
          execSync: execSyncMock,
        },
      })
      const cmd = new ValidateCommand(deps)

      // Act
      const exitCode = await cmd.run({ staged: true })

      // Assert
      expect(exitCode).toBe(0)
      expect(deps.logger.info).toHaveBeenCalledWith('No files to validate')
    })

    it('should filter out non-markdown files from staged list', async () => {
      // Arrange
      const execSyncMock = vi
        .fn<UnknownFn>()
        .mockReturnValue('test.md\nscript.ts\nREADME.md\nimage.png\n')
      const deps = createValidatorDeps({
        process: {
          execSync: execSyncMock,
        },
        fs: {
          readFile: vi.fn<AsyncUnknownFn>().mockResolvedValue('---\ntype: guide\n---\n# Title'),
        },
      })
      const cmd = new ValidateCommand(deps)

      // Act
      await cmd.run({ staged: true })

      // Assert
      // Should only read markdown files
      expect(deps.fs.readFile).toHaveBeenCalledTimes(2) // test.md and README.md
    })

    it('should map legacy types to simplified types', async () => {
      // Arrange - 'readme' is a legacy type that maps to 'guide'
      const deps = createValidatorDeps({
        glob: ['/fake/cwd/README.md'],
        fs: {
          readFile: vi.fn<AsyncUnknownFn>().mockResolvedValue('---\ntype: readme\n---\n# Title'),
        },
      })
      const cmd = new ValidateCommand(deps)

      // Act
      const exitCode = await cmd.run({ files: ['README.md'] })

      // Assert
      expect(exitCode).toBe(0) // Legacy 'readme' type is accepted and mapped to 'guide'
    })

    it('should accept unknown types with warning', async () => {
      // Arrange
      const deps = createValidatorDeps({
        glob: ['/fake/cwd/random.md'],
        fs: {
          readFile: vi
            .fn<AsyncUnknownFn>()
            .mockResolvedValue('---\ntype: some-custom-type\n---\n# Title'),
        },
      })
      const cmd = new ValidateCommand(deps)

      // Act
      const exitCode = await cmd.run({ files: ['random.md'] })

      // Assert
      expect(exitCode).toBe(0) // Unknown types pass but may get warnings
    })
  })
})
