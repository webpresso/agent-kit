/**
 * Tests for MigrateCommand.
 * Updated for simplified 5-type system (guide, research, implementation-plan, decision, unknown).
 */

import { describe, expect, it, vi } from 'vitest'

import { createMigratorDeps } from '#cli/factories'

import { MigrateCommand } from './migrate-command'

describe('MigrateCommand', () => {
  describe('run', () => {
    it('should skip files with frontmatter unless --force', async () => {
      // Arrange
      const deps = createMigratorDeps({
        glob: ['/fake/test.md'],
        fs: {
          readFile: vi.fn<() => void>().mockResolvedValue('---\ntype: guide\n---\n# Title'),
        },
      })
      const cmd = new MigrateCommand(deps)

      // Act
      const exitCode = await cmd.run({})

      // Assert
      expect(exitCode).toBe(0)
      expect(deps.fs.writeFile).not.toHaveBeenCalled()
    })

    it('should convert bold metadata to YAML frontmatter', async () => {
      // Arrange
      const content = `**Type**: Guide
**Category**: Development
**Focus**: Testing

# Document Title`
      const deps = createMigratorDeps({
        glob: ['/fake/docs/test.md'],
        fs: {
          readFile: vi.fn<() => void>().mockResolvedValue(content),
        },
      })
      const cmd = new MigrateCommand(deps)

      // Act
      const exitCode = await cmd.run({})

      // Assert
      expect(exitCode).toBe(0)
      // Simplified types: bold metadata 'Guide' becomes doc type 'guide'
      expect(deps.fs.writeFile).toHaveBeenCalledWith(
        '/fake/docs/test.md',
        expect.stringContaining('type: guide'),
      )
    })

    it('should not write files in dry-run mode', async () => {
      // Arrange
      const content = `**Type**: Guide\n\n# Document Title`
      const deps = createMigratorDeps({
        glob: ['/fake/docs/test.md'],
        fs: {
          readFile: vi.fn<() => void>().mockResolvedValue(content),
        },
      })
      const cmd = new MigrateCommand(deps)

      // Act
      const exitCode = await cmd.run({ dryRun: true })

      // Assert
      expect(exitCode).toBe(0)
      expect(deps.fs.writeFile).not.toHaveBeenCalled()
      expect(deps.logger.info).toHaveBeenCalledWith(expect.stringContaining('DRY RUN'))
    })

    it('should create backup files when --backup is set', async () => {
      // Arrange
      const content = `**Type**: Guide\n\n# Document Title`
      const deps = createMigratorDeps({
        glob: ['/fake/docs/test.md'],
        fs: {
          readFile: vi.fn<() => void>().mockResolvedValue(content),
        },
      })
      const cmd = new MigrateCommand(deps)

      // Act
      const exitCode = await cmd.run({ backup: true })

      // Assert
      expect(exitCode).toBe(0)
      expect(deps.fs.copyFile).toHaveBeenCalledWith('/fake/docs/test.md', '/fake/docs/test.md.bak')
    })

    it('should handle file write errors gracefully', async () => {
      // Arrange
      const content = `**Type**: Guide\n\n# Document Title`
      const deps = createMigratorDeps({
        glob: ['/fake/docs/test.md'],
        fs: {
          readFile: vi.fn<() => void>().mockResolvedValue(content),
          writeFile: vi.fn<() => void>().mockRejectedValue(new Error('Permission denied')),
        },
      })
      const cmd = new MigrateCommand(deps)

      // Act
      const exitCode = await cmd.run({})

      // Assert
      expect(exitCode).toBe(1)
      expect(deps.logger.error).toHaveBeenCalledWith(expect.stringContaining('Permission denied'))
    })

    it('should return early when file list is empty', async () => {
      // Arrange
      const deps = createMigratorDeps({
        glob: [],
      })
      const cmd = new MigrateCommand(deps)

      // Act
      const exitCode = await cmd.run({})

      // Assert
      expect(exitCode).toBe(0)
      expect(deps.fs.readFile).not.toHaveBeenCalled()
      expect(deps.logger.warn).toHaveBeenCalledWith(expect.stringContaining('No files found'))
    })

    it('should display results with added/updated/skipped counts', async () => {
      // Arrange
      const readFile = vi.fn<(path: string) => Promise<string>>()
      readFile
        .mockResolvedValueOnce(`**Type**: Guide\n\n# Title 1`)
        .mockResolvedValueOnce('---\ntype: guide\n---\n# Title 2')
        .mockResolvedValueOnce(`**Type**: Research\n\n# Title 3`)

      const deps = createMigratorDeps({
        glob: ['/fake/docs/test1.md', '/fake/docs/test2.md', '/fake/docs/test3.md'],
        fs: { readFile },
      })
      const cmd = new MigrateCommand(deps)

      // Act
      const exitCode = await cmd.run({})

      // Assert
      expect(exitCode).toBe(0)
      expect(deps.logger.success).toHaveBeenCalledWith(expect.stringContaining('Added: 2'))
      expect(deps.logger.success).toHaveBeenCalledWith(expect.stringContaining('Skipped: 1'))
    })

    it('should generate frontmatter for research doc type', async () => {
      // Arrange - research path maps to research type
      const content = `# Research Title`
      const deps = createMigratorDeps({
        glob: ['/fake/docs/research/test.md'],
        fs: {
          readFile: vi.fn<() => void>().mockResolvedValue(content),
        },
      })
      const cmd = new MigrateCommand(deps)

      // Act
      const exitCode = await cmd.run({})

      // Assert
      expect(exitCode).toBe(0)
      expect(deps.fs.writeFile).toHaveBeenCalledWith(
        '/fake/docs/research/test.md',
        expect.stringContaining('type: research'),
      )
    })

    it('should migrate multiple files', async () => {
      // Arrange
      const readFile = vi.fn<(path: string) => Promise<string>>()
      readFile
        .mockResolvedValueOnce(`**Type**: Guide\n\n# Title 1`)
        .mockResolvedValueOnce(`**Type**: Research\n\n# Title 2`)

      const deps = createMigratorDeps({
        glob: ['/fake/docs/test1.md', '/fake/docs/test2.md'],
        fs: { readFile },
      })
      const cmd = new MigrateCommand(deps)

      // Act
      const exitCode = await cmd.run({})

      // Assert
      expect(exitCode).toBe(0)
      expect(deps.fs.writeFile).toHaveBeenCalledTimes(2)
      expect(deps.fs.writeFile).toHaveBeenNthCalledWith(
        1,
        '/fake/docs/test1.md',
        expect.stringContaining('type: guide'),
      )
      expect(deps.fs.writeFile).toHaveBeenNthCalledWith(
        2,
        '/fake/docs/test2.md',
        expect.stringContaining('type: guide'), // docs/test2.md maps to guide
      )
    })

    it('should call logger.info when migration begins', async () => {
      // Arrange
      const deps = createMigratorDeps({
        glob: ['/fake/docs/test.md'],
        fs: {
          readFile: vi.fn<() => void>().mockResolvedValue(`**Type**: Guide\n\n# Title`),
        },
      })
      const cmd = new MigrateCommand(deps)

      // Act
      await cmd.run({})

      // Assert
      expect(deps.logger.info).toHaveBeenCalledWith(expect.stringContaining('Migrating'))
    })

    it('should call glob with correct patterns', async () => {
      // Arrange
      const deps = createMigratorDeps({
        glob: [],
      })
      const cmd = new MigrateCommand(deps)

      // Act
      await cmd.run({})

      // Assert
      expect(deps.glob).toHaveBeenCalledWith(
        ['**/*.md'],
        expect.objectContaining({
          ignore: expect.arrayContaining(['**/node_modules/**']),
        }),
      )
    })

    it('should check for existing backup files with existsSync', async () => {
      // Arrange
      const deps = createMigratorDeps({
        glob: ['/fake/docs/test.md'],
        fs: {
          readFile: vi.fn<() => void>().mockResolvedValue(`**Type**: Guide\n\n# Title`),
          existsSync: vi.fn<() => void>().mockReturnValue(true),
        },
      })
      const cmd = new MigrateCommand(deps)

      // Act
      await cmd.run({ backup: true })

      // Assert
      expect(deps.fs.existsSync).toHaveBeenCalledWith('/fake/docs/test.md.bak')
    })

    it('should update existing frontmatter when --force is set', async () => {
      // Arrange
      const content = '---\ntype: guide\n---\n# Title'
      const deps = createMigratorDeps({
        glob: ['/fake/docs/test.md'],
        fs: {
          readFile: vi.fn<() => void>().mockResolvedValue(content),
        },
      })
      const cmd = new MigrateCommand(deps)

      // Act
      const exitCode = await cmd.run({ force: true })

      // Assert
      expect(exitCode).toBe(0)
      expect(deps.fs.writeFile).toHaveBeenCalledWith(
        '/fake/docs/test.md',
        expect.stringContaining('---'),
      )
    })

    it('should log verbose output when --verbose is set', async () => {
      // Arrange
      const content = `**Type**: Guide\n\n# Title`
      const deps = createMigratorDeps({
        glob: ['/fake/docs/test.md'],
        fs: {
          readFile: vi.fn<() => void>().mockResolvedValue(content),
        },
      })
      const cmd = new MigrateCommand(deps)

      // Act
      await cmd.run({ verbose: true })

      // Assert
      expect(deps.logger.debug).toHaveBeenCalledTimes(1)
    })

    it('should handle files with no metadata gracefully', async () => {
      // Arrange
      const content = '# Title\n\nJust plain content'
      const deps = createMigratorDeps({
        glob: ['/fake/docs/test.md'],
        fs: {
          readFile: vi.fn<() => void>().mockResolvedValue(content),
        },
      })
      const cmd = new MigrateCommand(deps)

      // Act
      const exitCode = await cmd.run({})

      // Assert
      expect(exitCode).toBe(0)
      expect(deps.logger.warn).toHaveBeenCalledWith(expect.stringContaining('No metadata found'))
    })

    it('should use specific files when files option is provided', async () => {
      // Arrange
      const deps = createMigratorDeps({
        fs: {
          readFile: vi.fn<() => void>().mockResolvedValue(`**Type**: Guide\n\n# Title`),
        },
      })
      const cmd = new MigrateCommand(deps)

      // Act
      await cmd.run({ files: ['/specific/file.md'] })

      // Assert
      expect(deps.glob).not.toHaveBeenCalled()
      expect(deps.fs.readFile).toHaveBeenCalledWith('/specific/file.md')
    })

    it('should skip backup if backup file already exists', async () => {
      // Arrange
      const content = `**Type**: Guide\n\n# Title`
      const deps = createMigratorDeps({
        glob: ['/fake/docs/test.md'],
        fs: {
          readFile: vi.fn<() => void>().mockResolvedValue(content),
          existsSync: vi.fn<() => void>().mockReturnValue(true),
        },
      })
      const cmd = new MigrateCommand(deps)

      // Act
      await cmd.run({ backup: true })

      // Assert
      expect(deps.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Backup already exists'),
      )
      expect(deps.fs.copyFile).not.toHaveBeenCalled()
    })
  })
})
