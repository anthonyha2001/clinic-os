-- Add missing columns for public booking (run in Supabase SQL Editor)
-- Add missing columns if not there yet
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS booking_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS booking_message TEXT,
  ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Enable booking for your org
UPDATE organizations
SET booking_enabled = true
WHERE slug = 'clinic-os';

-- Verify
SELECT slug, booking_enabled, name FROM organizations;
