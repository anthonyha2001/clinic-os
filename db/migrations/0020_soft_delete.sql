-- Soft delete support for patients and appointments
ALTER TABLE patients ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_patients_not_deleted ON patients (organization_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_not_deleted ON appointments (organization_id, start_time) WHERE deleted_at IS NULL;
