-- Scheduling query performance indexes
CREATE INDEX IF NOT EXISTS idx_appt_org_start
  ON appointments (organization_id, start_time);

CREATE INDEX IF NOT EXISTS idx_provider_profiles_org
  ON provider_profiles (organization_id);

CREATE INDEX IF NOT EXISTS idx_checkins_org_checked_in
  ON appointment_checkins (organization_id, checked_in_at DESC);

CREATE INDEX IF NOT EXISTS idx_appointment_lines_appt_seq
  ON appointment_lines (appointment_id, sequence_order);
