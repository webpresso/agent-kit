---
title: BlueprintPlatformClient API Contract
status: draft
created: 2026-05-12
---

# BlueprintPlatformClient API Contract

This document describes the HTTP wire contract between the agent-kit sync
client and the private webpresso platform-api.  The TypeScript interface lives
at `src/blueprint/sync/types.ts` (exported as
`@webpresso/agent-kit/blueprint/sync/types`).  Platform team implements the
server side; agent-kit ships the types and the client.

---

## Authentication

All requests require an OAuth Bearer token obtained via the device-flow (Q2).

```
Authorization: Bearer <token>
```

The token is loaded at runtime by the injectable `getToken(): Promise<string>`
callback supplied to the sync client constructor.  It is never hardcoded.

Tokens are stored in the OS keychain (Keychain Access on macOS, Secret Service
on Linux, Credential Manager on Windows) and refreshed automatically on 401.

---

## Endpoints

### POST /v1/blueprint-events

Push a mutation event.

**Request body** (`BlueprintPlatformEvent`):

```jsonc
{
  "eventId":    "a1b2c3d4-...",  // UUID v4, client-generated
  "repoId":     "repo-abc",      // signed repo identifier from OAuth
  "occurredAt": "2026-05-12T00:00:00.000Z", // ISO 8601
  "type":       "blueprint.created",
  "payload": {
    "type":       "blueprint.created",
    "slug":       "my-feature",
    "title":      "My Feature",
    "complexity": "M",
    "status":     "planned"
  }
}
```

**Response codes:**

| Code | Meaning |
| ---- | ------- |
| 200  | Event accepted and applied. |
| 200  | Duplicate `(repoId, eventId)` — event already processed; idempotent ignore (Q1). |
| 400  | Malformed request body (missing required fields, unknown `type`). |
| 401  | Bearer token missing, expired, or revoked. Client should refresh and retry once. |
| 403  | Token is valid but the `repoId` in the body does not match the token's scope. |
| 429  | Rate limited. Retry after the `Retry-After` header value (seconds). |
| 5xx  | Transient server error. Client retries with exponential backoff (max 3 attempts). |

**Idempotency guarantee:** The platform uses `(repoId, eventId)` as a unique
key.  A second POST with the same pair returns 200 and does not re-apply the
event.  Clients should generate a fresh UUID v4 `eventId` per logical mutation;
they should reuse the same `eventId` only when retrying the same failed push.

---

### GET /v1/blueprint-snapshot

Pull the current state of all blueprints for the authenticated repo.

**Query parameters:**

| Parameter | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| `slug`    | string | No       | If supplied, return only the named blueprint. |

**Response body** (`BlueprintSnapshot`):

```jsonc
{
  "blueprints": [
    {
      "slug":       "my-feature",
      "title":      "My Feature",
      "status":     "in-progress",
      "complexity": "M",
      "tasks": [
        {
          "id":        "task-1",
          "title":     "Write tests",
          "status":    "todo",
          "dependsOn": []
        }
      ]
    }
  ],
  "fetchedAt": "2026-05-12T00:00:00.000Z"
}
```

**Response codes:**

| Code | Meaning |
| ---- | ------- |
| 200  | Snapshot returned. |
| 401  | Auth failure (see above). |
| 403  | Wrong repo scope. |
| 404  | `slug` not found for this repo (only when `slug` is supplied). |

---

### GET /v1/blueprint-templates

List available blueprint templates from the GitHub-hosted catalog (Q5).

**Response body** (`readonly BlueprintTemplateEntry[]`):

```jsonc
[
  {
    "name":        "SaaS Feature",
    "slug":        "saas-feature",
    "url":         "https://raw.githubusercontent.com/webpresso/templates/main/saas-feature.md",
    "description": "Standard SaaS feature blueprint with acceptance criteria."
  }
]
```

**Response codes:**

| Code | Meaning |
| ---- | ------- |
| 200  | Template list returned (may be empty array). |
| 401  | Auth failure. |
| 502  | GitHub source unreachable. Client falls back to empty list. |

---

### GET /v1/health

Check connectivity and OAuth token validity.

**Response body:**

```jsonc
{ "ok": true, "latencyMs": 42 }
```

Returns `ok: false` on any auth or network failure.  Clients surface this via
`BlueprintPlatformClient.healthCheck()`.

---

## Event payload reference

All 8 mutation operations the platform understands:

| `type`                       | Key payload fields |
| ---------------------------- | ------------------ |
| `blueprint.created`          | `slug`, `title`, `complexity`, `status` |
| `blueprint.status_changed`   | `slug`, `fromStatus`, `toStatus` |
| `blueprint.archived`         | `slug` |
| `blueprint.finalized`        | `slug` |
| `blueprint.metadata_updated` | `slug`, `changes` (sparse map of updated fields) |
| `task.created`               | `blueprintSlug`, `taskId`, `title` |
| `task.status_changed`        | `blueprintSlug`, `taskId`, `fromStatus`, `toStatus` |
| `runner.event`               | `blueprintSlug`, `executionHandle`, `sequence`, `kind` |

The `runner.event` type bridges Wave 1 runner work into the sync layer.
`kind` mirrors `RunnerEvent.type` values (`started`, `progress`, `stdout`,
`completed`, `failed`, `cancelled`).

---

## Bulk import (Q7)

On first auth, the agent-kit client imports all existing local blueprints by
issuing one `POST /v1/blueprint-events` per blueprint with
`type: 'blueprint.created'`.  Each call uses a freshly generated `eventId`.
The platform handles duplicates idempotently, so re-running import is safe.
