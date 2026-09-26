-- Apply before deploying the new application. Existing accounts keep their roles.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';
