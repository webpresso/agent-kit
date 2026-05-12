-- Core blueprint table
CREATE TABLE blueprints (
  slug                TEXT PRIMARY KEY,
  title               TEXT NOT NULL,
  status              TEXT NOT NULL CHECK (status IN ('draft','planned','in-progress','completed','parked','archived')),
  complexity          TEXT CHECK (complexity IN ('XS','S','M','L','XL')),
  owner               TEXT,
  created             TEXT,
  last_updated        TEXT,
  completed_at        TEXT,
  progress_pct        INTEGER,
  progress_text       TEXT,
  file_path           TEXT NOT NULL UNIQUE,
  byte_size           INTEGER NOT NULL,
  content_hash        TEXT NOT NULL,
  ingested_at         INTEGER NOT NULL,
  organization        TEXT NOT NULL,
  visibility          TEXT NOT NULL CHECK (visibility IN ('public','private'))
);
CREATE INDEX idx_blueprints_status     ON blueprints(status);
CREATE INDEX idx_blueprints_org_vis    ON blueprints(organization, visibility);

CREATE TABLE tags (slug TEXT PRIMARY KEY);
CREATE TABLE blueprint_tags (
  blueprint_slug TEXT NOT NULL REFERENCES blueprints(slug) ON DELETE CASCADE,
  tag_slug       TEXT NOT NULL REFERENCES tags(slug),
  PRIMARY KEY (blueprint_slug, tag_slug)
);

CREATE TABLE blueprint_dependencies (
  blueprint_slug   TEXT NOT NULL REFERENCES blueprints(slug) ON DELETE CASCADE,
  depends_on_slug  TEXT NOT NULL,
  is_resolved      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (blueprint_slug, depends_on_slug)
);

CREATE TABLE tasks (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  blueprint_slug   TEXT NOT NULL REFERENCES blueprints(slug) ON DELETE CASCADE,
  task_id          TEXT NOT NULL,
  lane             TEXT,
  title            TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('todo','in-progress','blocked','done','dropped')),
  wave             TEXT,
  description      TEXT,
  steps_tdd        TEXT,
  acceptance_json  TEXT,
  byte_size        INTEGER,
  UNIQUE (blueprint_slug, task_id)
);
CREATE INDEX idx_tasks_blueprint_status ON tasks(blueprint_slug, status);

CREATE TABLE task_dependencies (
  task_id              INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id   INTEGER NOT NULL REFERENCES tasks(id),
  PRIMARY KEY (task_id, depends_on_task_id)
);

CREATE TABLE task_files (
  task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  file_path   TEXT NOT NULL,
  op          TEXT NOT NULL CHECK (op IN ('create','modify','delete'))
);

CREATE TABLE risks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  blueprint_slug  TEXT NOT NULL REFERENCES blueprints(slug) ON DELETE CASCADE,
  risk_id         TEXT NOT NULL,
  severity        TEXT NOT NULL CHECK (severity IN ('CRITICAL','HIGH','MEDIUM','LOW')),
  description     TEXT NOT NULL,
  mitigation      TEXT NOT NULL,
  UNIQUE (blueprint_slug, risk_id)
);

CREATE TABLE edge_cases (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  blueprint_slug  TEXT NOT NULL REFERENCES blueprints(slug) ON DELETE CASCADE,
  edge_id         TEXT NOT NULL,
  severity        TEXT NOT NULL,
  description     TEXT NOT NULL,
  mitigation      TEXT NOT NULL,
  UNIQUE (blueprint_slug, edge_id)
);

CREATE TABLE tech_debt_items (
  slug                  TEXT PRIMARY KEY,
  status                TEXT NOT NULL CHECK (status IN ('accepted','needs-remediation','monitoring','resolved')),
  severity              TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  category              TEXT NOT NULL,
  review_cadence        TEXT NOT NULL CHECK (review_cadence IN ('weekly','biweekly','monthly','quarterly')),
  last_reviewed         TEXT,
  created               TEXT,
  next_review           TEXT,
  base_priority         INTEGER,
  file_path             TEXT NOT NULL UNIQUE,
  byte_size             INTEGER,
  content_hash          TEXT,
  organization          TEXT NOT NULL,
  visibility            TEXT NOT NULL CHECK (visibility IN ('public','private'))
);
CREATE INDEX idx_techdebt_next_review ON tech_debt_items(next_review);

CREATE TABLE tech_debt_linked_blueprints (
  techdebt_slug    TEXT NOT NULL REFERENCES tech_debt_items(slug) ON DELETE CASCADE,
  blueprint_slug   TEXT NOT NULL,
  PRIMARY KEY (techdebt_slug, blueprint_slug)
);

CREATE TABLE workspace_repos (
  repo_path        TEXT PRIMARY KEY,
  organization     TEXT NOT NULL,
  repo_name        TEXT NOT NULL,
  visibility       TEXT NOT NULL CHECK (visibility IN ('public','private')),
  last_synced      INTEGER
);

CREATE TABLE cross_repo_dependencies (
  blueprint_slug              TEXT NOT NULL REFERENCES blueprints(slug) ON DELETE CASCADE,
  target_repo                 TEXT NOT NULL,
  target_slug                 TEXT,
  target_slug_hash            TEXT,
  resolved_status             TEXT,
  resolved_at                 INTEGER,
  is_cross_org                INTEGER NOT NULL DEFAULT 0,
  is_redacted                 INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (blueprint_slug, target_repo, target_slug)
);

CREATE TABLE correlate_allowlist (
  source_org        TEXT NOT NULL,
  permitted_org     TEXT NOT NULL,
  PRIMARY KEY (source_org, permitted_org)
);

CREATE TABLE executions (
  handle            TEXT PRIMARY KEY,
  blueprint_slug    TEXT NOT NULL REFERENCES blueprints(slug) ON DELETE CASCADE,
  backend           TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('queued','running','completed','failed','cancelled')),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  started_at        TEXT,
  finished_at       TEXT,
  exit_code         INTEGER,
  error_message     TEXT,
  runner_id         TEXT,
  runner_version    TEXT,
  permissions       TEXT DEFAULT 'workspace-write'
);
CREATE INDEX idx_executions_blueprint ON executions(blueprint_slug);
CREATE INDEX idx_executions_status    ON executions(status);

CREATE TABLE runner_events (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_handle  TEXT NOT NULL,
  sequence          INTEGER NOT NULL,
  kind              TEXT NOT NULL,
  ts                TEXT NOT NULL DEFAULT (datetime('now')),
  message           TEXT,
  exit_code         INTEGER,
  file_path         TEXT,
  UNIQUE(execution_handle, sequence)
);
CREATE INDEX IF NOT EXISTS idx_runner_events_handle ON runner_events(execution_handle);
CREATE INDEX IF NOT EXISTS idx_runner_events_ts ON runner_events(ts);
