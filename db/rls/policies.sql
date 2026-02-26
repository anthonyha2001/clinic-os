-- K-14: org-isolation policies (defense-in-depth).
-- Apply after db/rls/enable.sql.

CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM users
  WHERE id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.current_user_org_id() TO authenticated, anon;

-- Tables with direct organization_id
DROP POLICY IF EXISTS organizations_org_isolation ON organizations;
CREATE POLICY organizations_org_isolation ON organizations
  FOR ALL
  USING (id = public.current_user_org_id())
  WITH CHECK (id = public.current_user_org_id());

DROP POLICY IF EXISTS users_org_isolation ON users;
CREATE POLICY users_org_isolation ON users
  FOR ALL
  USING (organization_id = public.current_user_org_id())
  WITH CHECK (organization_id = public.current_user_org_id());

DROP POLICY IF EXISTS provider_profiles_org_isolation ON provider_profiles;
CREATE POLICY provider_profiles_org_isolation ON provider_profiles
  FOR ALL
  USING (organization_id = public.current_user_org_id())
  WITH CHECK (organization_id = public.current_user_org_id());

DROP POLICY IF EXISTS policy_settings_org_isolation ON policy_settings;
CREATE POLICY policy_settings_org_isolation ON policy_settings
  FOR ALL
  USING (organization_id = public.current_user_org_id())
  WITH CHECK (organization_id = public.current_user_org_id());

DROP POLICY IF EXISTS services_org_isolation ON services;
CREATE POLICY services_org_isolation ON services
  FOR ALL
  USING (organization_id = public.current_user_org_id())
  WITH CHECK (organization_id = public.current_user_org_id());

DROP POLICY IF EXISTS payment_methods_org_isolation ON payment_methods;
CREATE POLICY payment_methods_org_isolation ON payment_methods
  FOR ALL
  USING (organization_id = public.current_user_org_id())
  WITH CHECK (organization_id = public.current_user_org_id());

DROP POLICY IF EXISTS tags_org_isolation ON tags;
CREATE POLICY tags_org_isolation ON tags
  FOR ALL
  USING (organization_id = public.current_user_org_id())
  WITH CHECK (organization_id = public.current_user_org_id());

DROP POLICY IF EXISTS patients_org_isolation ON patients;
CREATE POLICY patients_org_isolation ON patients
  FOR ALL
  USING (organization_id = public.current_user_org_id())
  WITH CHECK (organization_id = public.current_user_org_id());

DROP POLICY IF EXISTS patient_notes_org_isolation ON patient_notes;
CREATE POLICY patient_notes_org_isolation ON patient_notes
  FOR ALL
  USING (organization_id = public.current_user_org_id())
  WITH CHECK (organization_id = public.current_user_org_id());

DROP POLICY IF EXISTS appointments_org_isolation ON appointments;
CREATE POLICY appointments_org_isolation ON appointments
  FOR ALL
  USING (organization_id = public.current_user_org_id())
  WITH CHECK (organization_id = public.current_user_org_id());

DROP POLICY IF EXISTS plans_org_isolation ON plans;
CREATE POLICY plans_org_isolation ON plans
  FOR ALL
  USING (organization_id = public.current_user_org_id())
  WITH CHECK (organization_id = public.current_user_org_id());

DROP POLICY IF EXISTS invoices_org_isolation ON invoices;
CREATE POLICY invoices_org_isolation ON invoices
  FOR ALL
  USING (organization_id = public.current_user_org_id())
  WITH CHECK (organization_id = public.current_user_org_id());

DROP POLICY IF EXISTS payments_org_isolation ON payments;
CREATE POLICY payments_org_isolation ON payments
  FOR ALL
  USING (organization_id = public.current_user_org_id())
  WITH CHECK (organization_id = public.current_user_org_id());

DROP POLICY IF EXISTS risk_scores_org_isolation ON risk_scores;
CREATE POLICY risk_scores_org_isolation ON risk_scores
  FOR ALL
  USING (organization_id = public.current_user_org_id())
  WITH CHECK (organization_id = public.current_user_org_id());

DROP POLICY IF EXISTS audit_logs_org_isolation ON audit_logs;
CREATE POLICY audit_logs_org_isolation ON audit_logs
  FOR ALL
  USING (organization_id = public.current_user_org_id())
  WITH CHECK (organization_id = public.current_user_org_id());

DROP POLICY IF EXISTS roles_org_isolation ON roles;
CREATE POLICY roles_org_isolation ON roles
  FOR ALL
  USING (organization_id = public.current_user_org_id())
  WITH CHECK (organization_id = public.current_user_org_id());

-- Tables without direct organization_id
DROP POLICY IF EXISTS invoice_lines_org_isolation ON invoice_lines;
CREATE POLICY invoice_lines_org_isolation ON invoice_lines
  FOR ALL
  USING (
    invoice_id IN (
      SELECT id
      FROM invoices
      WHERE organization_id = public.current_user_org_id()
    )
  )
  WITH CHECK (
    invoice_id IN (
      SELECT id
      FROM invoices
      WHERE organization_id = public.current_user_org_id()
    )
  );

DROP POLICY IF EXISTS plan_items_org_isolation ON plan_items;
CREATE POLICY plan_items_org_isolation ON plan_items
  FOR ALL
  USING (
    plan_id IN (
      SELECT id
      FROM plans
      WHERE organization_id = public.current_user_org_id()
    )
  )
  WITH CHECK (
    plan_id IN (
      SELECT id
      FROM plans
      WHERE organization_id = public.current_user_org_id()
    )
  );

DROP POLICY IF EXISTS plan_status_history_org_isolation ON plan_status_history;
CREATE POLICY plan_status_history_org_isolation ON plan_status_history
  FOR ALL
  USING (
    plan_id IN (
      SELECT id
      FROM plans
      WHERE organization_id = public.current_user_org_id()
    )
  )
  WITH CHECK (
    plan_id IN (
      SELECT id
      FROM plans
      WHERE organization_id = public.current_user_org_id()
    )
  );

DROP POLICY IF EXISTS appt_status_history_org_isolation ON appointment_status_history;
CREATE POLICY appt_status_history_org_isolation ON appointment_status_history
  FOR ALL
  USING (
    appointment_id IN (
      SELECT id
      FROM appointments
      WHERE organization_id = public.current_user_org_id()
    )
  )
  WITH CHECK (
    appointment_id IN (
      SELECT id
      FROM appointments
      WHERE organization_id = public.current_user_org_id()
    )
  );

DROP POLICY IF EXISTS payment_allocations_org_isolation ON payment_allocations;
CREATE POLICY payment_allocations_org_isolation ON payment_allocations
  FOR ALL
  USING (
    payment_id IN (
      SELECT id
      FROM payments
      WHERE organization_id = public.current_user_org_id()
    )
  )
  WITH CHECK (
    payment_id IN (
      SELECT id
      FROM payments
      WHERE organization_id = public.current_user_org_id()
    )
  );

DROP POLICY IF EXISTS patient_tags_org_isolation ON patient_tags;
CREATE POLICY patient_tags_org_isolation ON patient_tags
  FOR ALL
  USING (
    patient_id IN (
      SELECT id
      FROM patients
      WHERE organization_id = public.current_user_org_id()
    )
  )
  WITH CHECK (
    patient_id IN (
      SELECT id
      FROM patients
      WHERE organization_id = public.current_user_org_id()
    )
  );

DROP POLICY IF EXISTS user_roles_org_isolation ON user_roles;
CREATE POLICY user_roles_org_isolation ON user_roles
  FOR ALL
  USING (
    role_id IN (
      SELECT id
      FROM roles
      WHERE organization_id = public.current_user_org_id()
    )
  )
  WITH CHECK (
    role_id IN (
      SELECT id
      FROM roles
      WHERE organization_id = public.current_user_org_id()
    )
  );

DROP POLICY IF EXISTS role_permissions_org_isolation ON role_permissions;
CREATE POLICY role_permissions_org_isolation ON role_permissions
  FOR ALL
  USING (
    role_id IN (
      SELECT id
      FROM roles
      WHERE organization_id = public.current_user_org_id()
    )
  )
  WITH CHECK (
    role_id IN (
      SELECT id
      FROM roles
      WHERE organization_id = public.current_user_org_id()
    )
  );
