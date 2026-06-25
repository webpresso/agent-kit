import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { SessionMemoryStore } from "#session-memory/store.js";
import {
  WP_SESSION_RETRIEVE_TOOL_NAME,
  type SessionElision,
  type SessionElisionKind,
} from "./_session-elision-schema.js";
import { defaultIndexDbPath } from "./tools/session-restore.js";

export {
  WP_SESSION_RETRIEVE_TOOL_NAME,
  sessionElisionKindSchema,
  sessionElisionSchema,
  type SessionElision,
  type SessionElisionKind,
} from "./_session-elision-schema.js";

export interface SessionElisionRecordInput {
  readonly source: string;
  readonly kind: SessionElisionKind;
  readonly text: string;
  readonly returnedText?: string;
  readonly rawBytes?: number;
  readonly returnedBytes?: number;
  readonly metadata?: Record<string, unknown>;
}

export interface SessionElisionRecordResult {
  readonly elision?: SessionElision;
  readonly warning?: string;
}

export interface SessionElisionRecorder {
  record(input: SessionElisionRecordInput): SessionElisionRecordResult;
}

const noopRecorder: SessionElisionRecorder = {
  record() {
    return {};
  },
};

export function createNoopSessionElisionRecorder(): SessionElisionRecorder {
  return noopRecorder;
}

export function contentHashElisionId(text: string): string {
  return `elision:${createHash("sha256").update(text).digest("hex").slice(0, 32)}`;
}

export function createSessionElisionRecorder(options: {
  readonly cwd?: string;
  readonly sourcePrefix: string;
  readonly dbPath?: string;
}): SessionElisionRecorder {
  const dbPath = options.dbPath ?? defaultIndexDbPath(options.cwd);

  return {
    record(input) {
      const rawBytes = input.rawBytes ?? utf8ByteLength(input.text);
      const returnedBytes =
        input.returnedBytes ??
        (input.returnedText === undefined ? 0 : utf8ByteLength(input.returnedText));
      const id = contentHashElisionId(input.text);
      const source = `${options.sourcePrefix}:${input.source}`;
      try {
        mkdirSync(dirname(dbPath), { recursive: true });
        const store = new SessionMemoryStore(dbPath);
        try {
          store.indexChunk({
            id,
            source,
            text: input.text,
            metadata: input.metadata
              ? {
                  ...input.metadata,
                  kind: input.kind,
                  rawBytes,
                  returnedBytes,
                  retrieveTool: WP_SESSION_RETRIEVE_TOOL_NAME,
                }
              : {
                  kind: input.kind,
                  rawBytes,
                  returnedBytes,
                  retrieveTool: WP_SESSION_RETRIEVE_TOOL_NAME,
                },
          });
        } finally {
          store.close();
        }
        return {
          elision: {
            id,
            source,
            kind: input.kind,
            rawBytes,
            returnedBytes,
            retrieveTool: WP_SESSION_RETRIEVE_TOOL_NAME,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          warning: `elision record failed for ${input.source}: ${message}`,
        };
      }
    },
  };
}

function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}
