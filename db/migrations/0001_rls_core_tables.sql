-- =============================================
-- K-13: RLS Policies — Core Tables (Batch 1)
-- =============================================

-- 1. Create helper function to get current user's org_id
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (SELECT organization_id FROM users WHERE id = auth.uid());
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_org_id() TO authenticated;

-- =============================================
-- 2. Enable RLS on all core tables
-- =============================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_sequences ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 3. Policies for each table
-- =============================================

-- ORGANIZATIONS
-- Users can only see their own org
CREATE POLICY "org_select" ON organizations
  FOR SELECT TO authenticated
  USING (id = public.get_user_org_id());

-- No direct INSERT/UPDATE/DELETE via client — managed by bootstrap and admin APIs
CREATE POLICY "org_insert" ON organizations
  FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "org_update" ON organizations
  FOR UPDATE TO authenticated
  USING (id = public.get_user_org_id());

CREATE POLICY "org_delete" ON organizations
  FOR DELETE TO authenticated
  USING (false);

-- USERS
CREATE POLICY "users_select" ON users
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());

CREATE POLICY "users_insert" ON users
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_org_id());

CREATE POLICY "users_update" ON users
  FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_org_id());

CREATE POLICY "users_delete" ON users
  FOR DELETE TO authenticated
  USING (organization_id = public.get_user_org_id());

-- ROLES (org-scoped)
CREATE POLICY "roles_select" ON roles
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());

CREATE POLICY "roles_insert" ON roles
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_org_id());

CREATE POLICY "roles_update" ON roles
  FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_org_id());

CREATE POLICY "roles_delete" ON roles
  FOR DELETE TO authenticated
  USING (organization_id = public.get_user_org_id());

-- PERMISSIONS (global table — all authenticated users can read)
CREATE POLICY "permissions_select" ON permissions
  FOR SELECT TO authenticated
  USING (true);

-- No client-side mutations on global permissions
CREATE POLICY "permissions_insert" ON permissions
  FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "permissions_update" ON permissions
  FOR UPDATE TO authenticated
  USING (false);

CREATE POLICY "permissions_delete" ON permissions
  FOR DELETE TO authenticated
  USING (false);

-- ROLE_PERMISSIONS (access via role's org)
CREATE POLICY "role_permissions_select" ON role_permissions
  FOR SELECT TO authenticated
  USING (
    role_id IN (SELECT id FROM roles WHERE organization_id = public.get_user_org_id())
  );

CREATE POLICY "role_permissions_insert" ON role_permissions
  FOR INSERT TO authenticated
  WITH CHECK (
    role_id IN (SELECT id FROM roles WHERE organization_id = public.get_user_org_id())
  );

CREATE POLICY "role_permissions_update" ON role_permissions
  FOR UPDATE TO authenticated
  USING (
    role_id IN (SELECT id FROM roles WHERE organization_id = public.get_user_org_id())
  );

CREATE POLICY "role_permissions_delete" ON role_permissions
  FOR DELETE TO authenticated
  USING (
    role_id IN (SELECT id FROM roles WHERE organization_id = public.get_user_org_id())
  );

-- USER_ROLES (access via role's org)
CREATE POLICY "user_roles_select" ON user_roles
  FOR SELECT TO authenticated
  USING (
    role_id IN (SELECT id FROM roles WHERE organization_id = public.get_user_org_id())
  );

CREATE POLICY "user_roles_insert" ON user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    role_id IN (SELECT id FROM roles WHERE organization_id = public.get_user_org_id())
  );

CREATE POLICY "user_roles_update" ON user_roles
  FOR UPDATE TO authenticated
  USING (
    role_id IN (SELECT id FROM roles WHERE organization_id = public.get_user_org_id())
  );

CREATE POLICY "user_roles_delete" ON user_roles
  FOR DELETE TO authenticated
  USING (
    role_id IN (SELECT id FROM roles WHERE organization_id = public.get_user_org_id())
  );

-- PROVIDER_PROFILES
CREATE POLICY "provider_profiles_select" ON provider_profiles
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());

CREATE POLICY "provider_profiles_insert" ON provider_profiles
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_org_id());

CREATE POLICY "provider_profiles_update" ON provider_profiles
  FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_org_id());

CREATE POLICY "provider_profiles_delete" ON provider_profiles
  FOR DELETE TO authenticated
  USING (organization_id = public.get_user_org_id());

-- SERVICES
CREATE POLICY "services_select" ON services
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());

CREATE POLICY "services_insert" ON services
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_org_id());

CREATE POLICY "services_update" ON services
  FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_org_id());

CREATE POLICY "services_delete" ON services
  FOR DELETE TO authenticated
  USING (organization_id = public.get_user_org_id());

-- SERVICE_TAGS (access via service's org — use service_id join)
CREATE POLICY "service_tags_select" ON service_tags
  FOR SELECT TO authenticated
  USING (
    service_id IN (SELECT id FROM services WHERE organization_id = public.get_user_org_id())
  );

CREATE POLICY "service_tags_insert" ON service_tags
  FOR INSERT TO authenticated
  WITH CHECK (
    service_id IN (SELECT id FROM services WHERE organization_id = public.get_user_org_id())
  );

CREATE POLICY "service_tags_update" ON service_tags
  FOR UPDATE TO authenticated
  USING (
    service_id IN (SELECT id FROM services WHERE organization_id = public.get_user_org_id())
  );

CREATE POLICY "service_tags_delete" ON service_tags
  FOR DELETE TO authenticated
  USING (
    service_id IN (SELECT id FROM services WHERE organization_id = public.get_user_org_id())
  );

-- PAYMENT_METHODS
CREATE POLICY "payment_methods_select" ON payment_methods
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());

CREATE POLICY "payment_methods_insert" ON payment_methods
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_org_id());

CREATE POLICY "payment_methods_update" ON payment_methods
  FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_org_id());

CREATE POLICY "payment_methods_delete" ON payment_methods
  FOR DELETE TO authenticated
  USING (organization_id = public.get_user_org_id());

-- POLICY_SETTINGS
CREATE POLICY "policy_settings_select" ON policy_settings
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());

CREATE POLICY "policy_settings_insert" ON policy_settings
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_org_id());

CREATE POLICY "policy_settings_update" ON policy_settings
  FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_org_id());

CREATE POLICY "policy_settings_delete" ON policy_settings
  FOR DELETE TO authenticated
  USING (organization_id = public.get_user_org_id());

-- TAGS
CREATE POLICY "tags_select" ON tags
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());

CREATE POLICY "tags_insert" ON tags
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_org_id());

CREATE POLICY "tags_update" ON tags
  FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_org_id());

CREATE POLICY "tags_delete" ON tags
  FOR DELETE TO authenticated
  USING (organization_id = public.get_user_org_id());

-- AUDIT_LOGS (read-only for authenticated, insert via server only)
CREATE POLICY "audit_logs_select" ON audit_logs
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());

CREATE POLICY "audit_logs_insert" ON audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_org_id());

-- No client-side update/delete on audit logs (immutable)
CREATE POLICY "audit_logs_update" ON audit_logs
  FOR UPDATE TO authenticated
  USING (false);

CREATE POLICY "audit_logs_delete" ON audit_logs
  FOR DELETE TO authenticated
  USING (false);

-- INVOICE_SEQUENCES
CREATE POLICY "invoice_sequences_select" ON invoice_sequences
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());

CREATE POLICY "invoice_sequences_insert" ON invoice_sequences
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_org_id());

CREATE POLICY "invoice_sequences_update" ON invoice_sequences
  FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_org_id());

CREATE POLICY "invoice_sequences_delete" ON invoice_sequences
  FOR DELETE TO authenticated
  USING (false);
