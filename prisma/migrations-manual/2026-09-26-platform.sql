CREATE TABLE IF NOT EXISTS platform_integrations (
  id text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  encrypted_secret text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS platform_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  target text,
  outcome text NOT NULL DEFAULT 'SUCCESS',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_audit_logs_created_at_id_idx ON platform_audit_logs(created_at, id);
CREATE INDEX IF NOT EXISTS platform_audit_logs_actor_id_created_at_idx ON platform_audit_logs(actor_id, created_at);
