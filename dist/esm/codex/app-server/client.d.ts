import { type CodexAppServerApi, type ConfigBatchWriteParams, type ConfigBatchWriteResponse, type HooksListResponse } from "./types.js";
interface ChildProcessLike {
    readonly stdin: {
        write(chunk: string, callback?: (error?: Error | null) => void): boolean;
        end(chunk?: string, callback?: () => void): void;
        on?(event: "error", listener: (error: Error) => void): unknown;
    };
    readonly stdout: NodeJS.ReadableStream;
    readonly stderr?: NodeJS.ReadableStream | null;
    kill(signal?: NodeJS.Signals | number): boolean;
    on(event: "error", listener: (error: Error) => void): this;
    on(event: "close", listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
}
type SpawnLike = (command: string, args: readonly string[], options: {
    cwd?: string;
    stdio: ["pipe", "pipe", "pipe"];
}) => ChildProcessLike;
export interface CodexAppServerClientOptions {
    readonly command?: string;
    readonly cwd?: string;
    readonly spawn?: SpawnLike;
    readonly timeoutMs?: number;
}
export declare class CodexAppServerClient implements CodexAppServerApi {
    private readonly child;
    private readonly timeoutMs;
    private readonly pending;
    private readonly ready;
    private nextId;
    private stdoutBuffer;
    private stderrBuffer;
    private closed;
    private fatalError;
    private constructor();
    static start(options?: CodexAppServerClientOptions): Promise<CodexAppServerClient>;
    hooksList(cwds: string[]): Promise<HooksListResponse>;
    configBatchWrite(params: ConfigBatchWriteParams): Promise<ConfigBatchWriteResponse>;
    close(): Promise<void>;
    private attachListeners;
    private drainStdoutBuffer;
    private handleStdoutLine;
    private initialize;
    private notify;
    private request;
    private decorateErrorMessage;
    private failTransport;
    private rejectAll;
}
export {};
//# sourceMappingURL=client.d.ts.map