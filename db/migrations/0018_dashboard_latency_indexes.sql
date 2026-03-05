-- Additional read-optimized indexes for dashboard/list APIs
-- appointments(organization_id, start_time) already exists as idx_appt_org_start

CREATE INDEX IF NOT EXISTS idx_patients_org
  ON patients (organization_id);

CREATE INDEX IF NOT EXISTS idx_invoices_org
  ON invoices (organization_id);

CREATE INDEX IF NOT EXISTS idx_appointments_provider
  ON appointments (provider_id, start_time);

CREATE INDEX IF NOT EXISTS idx_audit_log_org
  ON audit_logs (organization_id, created_at DESC);
