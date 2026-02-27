-- Add working_hours and off_days columns for clinic schedule (run in SQL Editor)
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS working_hours JSONB,
  ADD COLUMN IF NOT EXISTS off_days JSONB;
