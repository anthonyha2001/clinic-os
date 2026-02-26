-- =============================================
-- S-01b: Double-Booking Prevention
-- PostgreSQL EXCLUDE constraint with GiST index
-- =============================================

-- 1. Enable btree_gist extension (required for combining btree and range operators)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. Add EXCLUDE constraint on appointments
-- This prevents overlapping time ranges for the same provider in the same org.
-- Only non-canceled appointments are checked (canceled ones are "freed" slots).
ALTER TABLE appointments
  ADD CONSTRAINT no_double_booking
  EXCLUDE USING gist (
    organization_id WITH =,
    provider_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
  )
  WHERE (status <> 'canceled');

-- NOTES:
-- '[)' means: start inclusive, end exclusive (10:00-10:30 and 10:30-11:00 don't overlap)
-- && is the "overlaps" operator for ranges
-- WHERE clause excludes canceled appointments from the check
-- btree_gist is needed to combine = (equality) with && (range overlap) in one GiST index
-- This is a DATABASE-LEVEL constraint — cannot be bypassed by application code
