-- Auth fallback lookup optimization
-- users(id) and roles(id) are typically covered by primary key indexes.
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id
  ON user_roles (user_id);
