export interface SearchMatch {
  path: string
  line: number
  content: string
  matchStart: number
  matchEnd: number
}

export interface StorageAdapter {
  listFiles(
    path: string,
    options?: { recursive?: boolean; pattern?: string },
  ): Promise<Array<{ path: string; type: string; size?: number }>>
  readFile(path: string, options?: { startLine?: number; endLine?: number }): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  searchFiles(
    pattern: string,
    options?: {
      path?: string
      filePattern?: string
      caseSensitive?: boolean
      maxResults?: number
    },
  ): Promise<SearchMatch[]>
  exists(path: string): Promise<boolean>
  lockFile(path: string, lockerId: string): Promise<boolean>
  isLocked(path: string): Promise<{ locked: boolean; lockerId?: string }>
  unlockFile(path: string, lockerId: string): Promise<void>
}
