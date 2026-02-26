-- Waiting room / check-in tracking
-- Run this in Supabase SQL editor before using the reception feature

CREATE TABLE IF NOT EXISTS appointment_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id),
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  called_in_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','in_chair','done','skipped')),
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(appointment_id)
);

ALTER TABLE appointment_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON appointment_checkins
  USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

-- Grant receptionist permissions (run after confirming role exists for your org)
-- Uses existing permission keys from schema
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'receptionist'
  AND p.key IN ('appointment.manage', 'patient.manage', 'invoice.create', 'payment.record')
ON CONFLICT (role_id, permission_id) DO NOTHING;
