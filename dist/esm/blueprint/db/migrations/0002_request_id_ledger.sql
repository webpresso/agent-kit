CREATE TABLE IF NOT EXISTS mutation_request_ledger (
  tool_name      TEXT NOT NULL,
  request_id     TEXT NOT NULL,
  payload_hash   TEXT NOT NULL,
  response_json  TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tool_name, request_id)
);

CREATE INDEX IF NOT EXISTS idx_mutation_request_ledger_created_at
  ON mutation_request_ledger(created_at);
