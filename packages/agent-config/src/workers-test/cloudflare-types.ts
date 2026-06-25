export interface DurableObjectId {
  toString(): string;
  equals(other: DurableObjectId): boolean;
  name?: string;
}

export interface DurableObjectStub {
  fetch(request: Request | string, init?: RequestInit): Promise<Response>;
}

export interface DurableObjectNamespace {
  newUniqueId(options?: unknown): DurableObjectId;
  idFromName(name: string): DurableObjectId;
  idFromString(id: string): DurableObjectId;
  get(id: DurableObjectId, options?: unknown): DurableObjectStub;
  getByName(name: string, options?: unknown): DurableObjectStub;
}

export interface Hyperdrive {
  connectionString: string;
  connect(): unknown;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface ExecutionContext<Props = unknown> {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
  props: Props;
}
