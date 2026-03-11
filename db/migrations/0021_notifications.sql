-- Migration: 0021_notifications
-- Creates the notifications table for in-app notification bell

CREATE TABLE IF NOT EXISTS notifications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type             VARCHAR(80)  NOT NULL,   -- 'new_appointment' | 'schedule_change' | 'no_show' | 'eod_summary'
  title            VARCHAR(255) NOT NULL,
  body             TEXT         NOT NULL,
  link             VARCHAR(500),            -- optional deep-link e.g. /en/appointments
  is_read          BOOLEAN      NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_unread
  ON notifications(user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_org_created
  ON notifications(organization_id, created_at DESC);