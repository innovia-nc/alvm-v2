BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS login_attempts (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL
);
UPDATE users u SET disabled_at = now(), session_version = session_version + 1
WHERE disabled_at IS NULL AND (
  (role = 'PARENT' AND EXISTS (SELECT 1 FROM parents p WHERE p.user_id = u.id AND p.deleted_at IS NOT NULL)) OR
  (role = 'STAFF' AND EXISTS (SELECT 1 FROM staff_members s WHERE s.user_id = u.id AND s.deleted_at IS NOT NULL))
);
COMMIT;
