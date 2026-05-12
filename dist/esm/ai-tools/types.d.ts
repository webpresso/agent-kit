import type { StorageAdapter, SearchMatch } from '@webpresso/runtime-storage/storage-adapter';
export type { StorageAdapter, SearchMatch };
export type JSONSchema7TypeName = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null';
export type JSONSchema7Type = string | number | boolean | JSONSchema7Object | JSONSchema7Array | null;
export interface JSONSchema7Object {
    [key: string]: JSONSchema7Type;
}
export interface JSONSchema7Array extends Array<JSONSchema7Type> {
}
export type JSONSchema7Definition = JSONSchema7 | boolean;
export type JSONSchema7 = {
    $schema?: string;
    title?: string;
    description?: string;
    default?: unknown;
    multipleOf?: number;
    maximum?: number;
    exclusiveMaximum?: number;
    minimum?: number;
    exclusiveMinimum?: number;
    maxLength?: number;
    minLength?: number;
    pattern?: string;
    additionalItems?: JSONSchema7Definition;
    items?: JSONSchema7Definition | JSONSchema7Definition[];
    maxItems?: number;
    minItems?: number;
    uniqueItems?: boolean;
    contains?: JSONSchema7Definition;
    maxProperties?: number;
    minProperties?: number;
    required?: string[];
    additionalProperties?: JSONSchema7Definition;
    definitions?: Record<string, JSONSchema7Definition>;
    dependencies?: Record<string, JSONSchema7Definition | string[]>;
    properties?: Record<string, JSONSchema7Definition>;
    patternProperties?: Record<string, JSONSchema7Definition>;
    type?: JSONSchema7TypeName | JSONSchema7TypeName[];
    format?: string;
    enum?: JSONSchema7Type[];
    const?: JSONSchema7Type;
    oneOf?: JSONSchema7Definition[];
    anyOf?: JSONSchema7Definition[];
    allOf?: JSONSchema7Definition[];
    not?: JSONSchema7Definition;
};
export interface ChunkMetadata {
    filepath: string;
    startLine: number;
    endLine: number;
    language: string;
    symbols: string[];
    hasFunction: boolean;
    hasClass: boolean;
    indexedAt: number;
    content?: string;
}
export interface CodeChunk {
    id: string;
    content: string;
    metadata: ChunkMetadata;
    embedding?: number[];
}
export interface RetrievalResult {
    chunk: CodeChunk;
    score: number;
}
export interface SearchOptions {
    topK?: number;
    minScore?: number;
    pathFilters?: string[];
    languageFilters?: string[];
    symbolFilters?: string[];
    functionsOnly?: boolean;
    classesOnly?: boolean;
}
export interface RAGContext {
    chunks: RetrievalResult[];
    tokenCount: number;
    formattedContext: string;
}
export interface RAGRetriever {
    processVectorResults(results: Array<{
        id: string;
        score: number;
        metadata?: Record<string, unknown>;
    }>, minScore: number): RetrievalResult[];
    retrieve(query: string, options?: SearchOptions): Promise<RAGContext>;
    retrieveMultiple(queries: string[], options?: SearchOptions): Promise<RAGContext>;
}
export type FileOperation = 'create' | 'modify' | 'delete';
export interface PendingChange {
    id: string;
    path: string;
    originalContent: string | null;
    newContent: string | null;
    type: 'create' | 'modify' | 'delete';
    status: 'pending' | 'accepted' | 'rejected';
    createdAt: Date;
    description?: string;
}
export type ChangeStatus = 'pending' | 'accepted' | 'rejected';
export interface DiffLine {
    type: 'context' | 'add' | 'remove';
    content: string;
    oldLineNumber?: number;
    newLineNumber?: number;
}
export interface DiffHunk {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: DiffLine[];
}
export interface UnifiedDiff {
    path: string;
    hunks: DiffHunk[];
    additions: number;
    deletions: number;
}
export interface PendingChangesManager {
    addCreate(path: string, content: string, description?: string): PendingChange;
    addModify(path: string, originalContent: string, newContent: string, description?: string): PendingChange;
    addDelete(path: string, originalContent: string, description?: string): PendingChange;
    getChanges(): PendingChange[];
    getChangesByStatus(status: ChangeStatus): PendingChange[];
    getChange(id: string): PendingChange | undefined;
    getChangeByPath(path: string): PendingChange | undefined;
    accept(id: string): boolean;
    reject(id: string): boolean;
    acceptAll(): number;
    rejectAll(): number;
    applyAccepted(storage: StorageAdapter): Promise<number>;
    getDiff(id: string): UnifiedDiff | undefined;
    getSummary(): {
        total: number;
        pending: number;
        accepted: number;
        rejected: number;
        additions: number;
        deletions: number;
    };
    clear(): void;
    clearRejected(): number;
}
export interface FileChange {
    id: string;
    path: string;
    before: string | null;
    after: string | null;
    operation: FileOperation;
    timestamp: number;
    toolCallId: string;
}
export interface RevertResult {
    success: boolean;
    path: string;
    operation: FileOperation;
    error?: string;
}
export interface ChangeTrackerDiff {
    path: string;
    changeId: string;
    operation: FileOperation;
    lines: Array<{
        type: 'header' | 'context' | 'addition' | 'deletion';
        content: string;
        oldLineNumber?: number;
        newLineNumber?: number;
    }>;
}
export interface ChangeTracker {
    getSessionId(): string;
    recordChange(change: {
        path: string;
        before: string | null;
        after: string | null;
        operation: FileOperation;
        toolCallId: string;
    }): FileChange;
    listChanges(): FileChange[];
    getChangesForFile(path: string): FileChange[];
    getChange(id: string): FileChange | undefined;
    getDiff(changeId: string): ChangeTrackerDiff | null;
    revert(changeId: string, storage: StorageAdapter): Promise<RevertResult>;
    clear(): void;
    size(): number;
}
export interface CommandRequest {
    command: string;
    cwd?: string;
    env?: Record<string, string>;
    timeout?: number;
    stream?: boolean;
}
export interface CommandOutput {
    stdout: string;
    stderr: string;
    exitCode: number;
    durationMs: number;
}
export type TerminalEvent = {
    type: 'start';
    executionId: string;
    command: string;
} | {
    type: 'stdout';
    executionId: string;
    data: string;
} | {
    type: 'stderr';
    executionId: string;
    data: string;
} | {
    type: 'exit';
    executionId: string;
    exitCode: number;
    durationMs: number;
} | {
    type: 'error';
    executionId: string;
    message: string;
} | {
    type: 'timeout';
    executionId: string;
};
export interface CommandExecutor {
    execute(request: CommandRequest): Promise<CommandOutput>;
    executeStream(request: CommandRequest, onEvent: (event: TerminalEvent) => void): Promise<CommandOutput>;
    kill(executionId: string): Promise<boolean>;
    isRunning(executionId: string): Promise<boolean>;
}
export interface SessionSnapshot {
    id: string;
    timestamp: Date;
    toolName: string;
    toolInput: Record<string, unknown>;
    filesState: Map<string, string>;
    description: string;
}
export interface SnapshotManager {
    createSnapshot(toolName: string, toolInput: Record<string, unknown>): Promise<SessionSnapshot>;
    restoreSnapshot(snapshotId: string): Promise<boolean>;
    getSnapshots(): SessionSnapshot[];
    getSnapshot(snapshotId: string): SessionSnapshot | undefined;
    undo(): Promise<SessionSnapshot | undefined>;
    clear(): void;
}
export interface GitAdapter {
    getCurrentBranch(): Promise<string>;
    getStatus(): Promise<Array<{
        path: string;
        status: string;
    }>>;
    getLog(depth?: number): Promise<Array<{
        sha: string;
        message: string;
        author: {
            name: string;
            email: string;
        };
        timestamp: number;
    }>>;
    stageFile(filepath: string): Promise<void>;
    unstageFile(filepath: string): Promise<void>;
    commit(message: string, author: {
        name: string;
        email: string;
    }): Promise<string>;
    push(remote: string, options?: {
        branch?: string;
        force?: boolean;
        token?: string;
    }): Promise<void>;
    pull(remote: string, options?: {
        branch?: string;
        token?: string;
        author?: {
            name: string;
            email: string;
        };
    }): Promise<{
        updated: boolean;
        sha: string;
    }>;
    listBranches(): Promise<string[]>;
    checkout(branch: string, options?: {
        create?: boolean;
    }): Promise<void>;
    deleteBranch(branch: string): Promise<void>;
}
export interface ToolContext {
    projectId: string;
    orgId: string;
    userId: string;
    storage?: StorageAdapter;
    ragRetriever?: RAGRetriever;
    git?: GitAdapter;
    executor?: CommandExecutor;
    snapshotManager?: SnapshotManager;
    pendingChanges?: PendingChangesManager;
    changeTracker?: ChangeTracker;
    lockerId?: string;
    toolCallId?: string;
    metadata?: Record<string, unknown>;
}
export interface ToolResult {
    success: boolean;
    output: string;
    data?: unknown;
    error?: string;
}
export interface AgentTool {
    name: string;
    description: string;
    inputSchema: JSONSchema7;
    execute: (input: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
}
//# sourceMappingURL=types.d.ts.map