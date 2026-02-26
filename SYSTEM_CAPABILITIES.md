# Clinic OS — System Capabilities & Features

A detailed reference of everything the **Clinic OS** ERP medical system can do.

---

## Table of Contents

1. [Overview](#overview)
2. [Multi-Tenancy & Organizations](#multi-tenancy--organizations)
3. [Authentication & Authorization](#authentication--authorization)
4. [Dashboard](#dashboard)
5. [Patient Management](#patient-management)
6. [Dental Module](#dental-module)
7. [Scheduling & Appointments](#scheduling--appointments)
8. [Reception](#reception)
9. [Treatment Plans](#treatment-plans)
10. [Billing & Invoicing](#billing--invoicing)
11. [Payments](#payments)
12. [Reports & Analytics](#reports--analytics)
13. [Automations](#automations)
14. [Settings & Configuration](#settings--configuration)
15. [Public Booking](#public-booking)
16. [Superadmin](#superadmin)
17. [Internationalization](#internationalization)
18. [Technical Architecture](#technical-architecture)
19. [API Reference](#api-reference)

---

## Overview

**Clinic OS** is a full-featured ERP system for medical and dental clinics. It supports:

- Multi-tenant organizations
- Role-based access control with granular permissions
- Scheduling and calendar views (day/week)
- Treatment plans with sessions and progress tracking
- End-to-end billing, invoicing, and payment recording
- No-show risk scoring and deposit policies
- Multi-language (EN, FR, AR) with RTL support for Arabic

---

## Multi-Tenancy & Organizations

| Capability | Details |
|------------|---------|
| **Organizations** | Each clinic is a separate organization with its own data (patients, appointments, invoices, etc.) |
| **Org attributes** | `name`, `slug`, `timezone`, `currency` |
| **Data isolation** | Row Level Security (RLS) enforces org boundaries; users only see data for their organization |
| **Currencies** | USD, EUR, GBP, LBP, AED, SAR |
| **Timezones** | Asia/Beirut, UTC, America/New_York, Europe/London, Asia/Dubai, Asia/Riyadh |

---

## Authentication & Authorization

### Login

- Supabase email/password authentication
- Session-based access; `/api/auth/me` returns current user and org
- Optional dev bypass: `TEST_AUTH_BYPASS=true` with `X-Test-User-Id` header

### Roles (per organization)

| Role | Typical access |
|------|----------------|
| **admin** | Full access; settings, reports, user management |
| **manager** | Same as admin |
| **receptionist** | Scheduling, patients, basic billing |
| **provider** | Provider-specific views and actions |
| **accountant** | Billing, payments, reports |

### Permissions (granular)

| Permission Key | Description |
|----------------|-------------|
| `service.edit_price` | Edit service prices |
| `discount.large` | Apply discounts above the large-discount threshold |
| `invoice.void` | Void invoices |
| `payment.void` | Void payments |
| `settings.edit` | Edit org settings |
| `user.manage` | Manage users and roles |
| `reports.view` | View reports |
| `patient.manage` | Manage patient records |
| `appointment.manage` | Create/edit appointments |
| `invoice.create` | Create invoices |
| `payment.record` | Record payments |

### Navigation by role

- **Dashboard, Scheduling, Patients, Billing, Plans** — visible to all roles
- **Reports** — admin, manager, accountant only
- **Settings** — admin, manager only

---

## Dashboard

The main dashboard shows:

- **KPI cards**: Revenue (month), New patients, Completion rate, No-show rate
- **Today’s timeline**: List of today’s appointments
- **Today’s schedule**: Schedule summary for the day
- **Unpaid summary**: Count and total of unpaid invoices
- **At-risk patients**: Patients with high no-show risk
- **Activity feed**: Recent audit log entries (last 10)

---

## Patient Management

### Patient list (`/patients`)

- Search by name
- Pagination
- Creation of new patients

### Patient record (`/patients/[id]`)

- **Overview**: Demographics, contact info, tags, risk badge
- **Timeline**: Chronological events
- **Appointments**: Past and upcoming appointments
- **Plans**: Treatment plans and status
- **Billing**: Linked invoices and payments
- **Notes**: Clinical notes with pin/unpin and soft delete

### Patient data

- First name, last name
- Date of birth
- Phone, email
- Address
- Preferred locale (en/fr/ar)

### Patient tags

- Create, assign, and remove tags
- Tags have names in EN/FR/AR and colors
- Patient–tag many-to-many via `patient_tags`

### Patient notes

- Text content
- Pinned/unpinned
- Soft delete (not physically removed)
- Create, edit, delete via API

### No-show risk

- Risk score from historical no-shows
- `risk_scores` stores: total appointments, no-show count, score
- Threshold from `policy_settings.no_show_risk_threshold` (default 3)
- High-risk badge shown in UI
- Inactive patients: no visits for X days (configurable)

---

## Dental Module

Dental-specific features on the patient record (`/patients/[id]`).

### Dental chart

- Per-tooth conditions stored in `dental_chart` (patient_id, tooth_number)
- UI for periapical conditions per tooth

### X-rays

- Upload X-ray images via `POST /api/dental/xrays/uploads` (presigned URL flow)
- List/add X-rays per patient: `GET/POST /api/dental/xrays/[patientId]`
- Fields: tooth_number, xray_type, file_url, taken_at

### Medical history

- `GET/POST /api/dental/medical-history/[patientId]`
- Blood type, allergies, conditions, etc.

---

## Scheduling & Appointments

### Views

- **Day view**: Single-day schedule
- **Week view**: Week at a glance
- **Mini calendar**: Month picker for navigation

### Appointment creation

- Patient, provider, date/time, service(s)
- Duration and price from service defaults (editable)
- Optional link to a plan item (for plan sessions)

### Appointment status workflow

| Current status | Allowed next statuses |
|----------------|------------------------|
| `scheduled` | confirmed, canceled, completed |
| `confirmed` | completed, canceled, no_show |
| `completed` | — |
| `canceled` | scheduled |
| `no_show` | scheduled |

### On completion

1. Plan item `quantity_completed` incremented if linked
2. Plan moved from `accepted` → `in_progress` when first session is completed
3. Plan moved to `completed` when all plan items are done
4. Invoice auto-created for the appointment session

### Rebook suggestions

- For no-show appointments: `/api/appointments/[id]/rebook-suggestion`
- Suggests times based on availability

### Appointment panel

- View appointment details
- Change status (e.g. Mark Complete, Mark No-Show)
- Rebook (for no-show)
- View invoice (if one exists)

### Session schedule popup (plan sessions)

- Used to schedule a session from a plan item
- Month picker + time slots (08:00–19:30)
- Busy slots excluded per provider
- Creates appointment linked to plan item

---

## Reception

Waiting room / check-in at `/reception`.

| API | Description |
|-----|-------------|
| `GET/POST /api/reception/checkin` | Check-in list / create check-in |
| `PATCH /api/reception/checkin/[id]` | Update check-in |
| `GET /api/reception/week` | Week view data |
| `GET /api/reception/patient-file/[patientId]` | Patient file for reception |

- `appointment_checkins` table tracks check-ins

---

## Treatment Plans

### Plan status workflow

| Status | Next allowed statuses |
|--------|------------------------|
| `proposed` | accepted, canceled |
| `accepted` | in_progress, canceled |
| `in_progress` | completed, canceled |
| `completed` | — |
| `canceled` | — |

### Plan structure

- **Plan**: Patient, provider, status, dates
- **Plan items**: Services with `quantity_total`, `quantity_completed`, `sequence_order`, `unit_price`

### Plan detail UI

- Status and progress
- Plan items with “Schedule” for incomplete sessions
- “Mark Complete” on scheduled appointments
- “Issue Full Plan Invoice” when plan is completed

### Plan → Invoice

- `POST /api/plans/invoice` creates an invoice from all plan sessions
- Each line: service + session label (e.g. “Session 2/5”)

### Plan sessions

- Appointments linked to plan items via `plan_item_id`
- Completing an appointment updates the plan item and plan status
- Auto-invoice on completion

---

## Billing & Invoicing

### Invoice status workflow

| Status | Next allowed statuses |
|--------|------------------------|
| `draft` | issued |
| `issued` | partially_paid, paid, voided |
| `partially_paid` | paid, voided |
| `paid` | — |
| `voided` | — |

### Invoice creation

- Manual: `/billing/new` — add lines (service, qty, unit price)
- From plan: “Issue Full Plan Invoice” when plan is completed
- Auto: Invoice created when appointment with linked plan item is marked completed

### Invoice lines

- Service reference
- Optional plan item reference
- Quantity, unit price, description (EN/FR/AR)

### Invoice actions

- Change status (issue, mark paid, void)
- Apply discount (amount or percent)
- Large discounts require `discount.large` permission

### Invoice numbering

- Org-specific sequences in `invoice_sequences`

### Billing list (`/billing`)

- Filters (status, date range, patient)
- Bulk actions
- Quick pay drawer

---

## Payments

### Payment recording

- Amount, payment method (cash, card, bank_transfer)
- Optional allocation to specific invoices
- Immutable records

### Payment allocation

- Allocate payment to one or more invoices
- `payment_allocations` links payment ↔ invoice

### Deposit policy

- `policy_settings.deposit_required_above_risk`
- High-risk patients can require deposit before booking
- `noshow/checkDeposit.ts` supports this logic

---

## Reports & Analytics

| Report | Description |
|--------|-------------|
| **Revenue** | Revenue over date range |
| **Revenue by Service** | Revenue grouped by service |
| **Revenue by Provider** | Revenue grouped by provider |
| **Unpaid** | Unpaid invoices with totals |
| **Appointments** | Appointment counts, status breakdown |
| **Providers** | Provider performance metrics |
| **Patients** | Patient analytics |
| **Plan Conversion** | Proposed → accepted → completed conversion |

- All reports use configurable date ranges
- Role-gated: admin, manager, accountant

---

## Automations

| API | Description |
|-----|-------------|
| `POST /api/automation/trigger` | Run automations (reminders, recalls, no-shows) |
| `POST /api/automation/process` | Process automation queue |
| `GET /api/automation/events` | Automation events |

- Event types: no_show_followup, recall_due, plan_completed, auto_invoice
- WhatsApp integration for reminders and no-show follow-ups
- Automation panel at `/automation`

### Recalls

- `GET/PATCH /api/recalls` — Recall list and status
- `patient_recalls` table: recall_type, due_date, status
- Recall engine (e.g. 6-month routine checkup)

---

## Settings & Configuration

### Services (`/settings/services`)

- CRUD for services
- **Inline edit**: Edit name, price, duration from the services table (Pencil icon, Save/Cancel)
- Fields: name_en, name_fr, name_ar, default_price, default_duration_minutes, category, is_active
- **Service categories**: consultation, procedure, imaging, lab, other
- Add services manually (no prebuilt catalog import)

### Provider types

- General Practitioner, Dentist, Physiotherapist, Dermatologist, Pediatrician, Gynecologist, Cardiologist, Orthopedic Surgeon, Neurologist, Psychiatrist, Ophthalmologist, ENT Specialist, Nutritionist, Nurse, Radiologist

### Provider profiles

- Specialty, bio, color, accepting appointments

### Policy settings (`policy_settings`)

| Setting | Default | Purpose |
|---------|---------|---------|
| `no_show_risk_threshold` | 3 | No-shows above this → high risk |
| `deposit_required_above_risk` | true | Require deposit for high-risk |
| `inactivity_days_warning` | 60 | Days since last visit → warning |
| `inactivity_days_critical` | 90 | Days since last visit → critical |
| `large_discount_threshold_percent` | 20 | Discounts above this need `discount.large` |

### Payment methods

- cash, card, bank_transfer
- CRUD via `/api/payment-methods`

### Users & roles

- Create users, assign roles
- Under Settings (admin/manager)

### Clinic info

- **Clinic name**: Editable in Settings → Clinic Info
- Public booking link (shareable)
- Org settings: name, timezone, currency, clinic_phone, clinic_address, clinic_email, logo_url

---

## Public Booking

Public booking at `/book/[slug]` (org identified by slug).

| API | Description |
|-----|-------------|
| `GET /api/book/[slug]/providers` | Providers for org |
| `GET /api/book/[slug]/services` | Services for org |
| `GET /api/book/[slug]/availability` | Busy slots |
| `POST /api/book/[slug]/submit` | Submit booking |

- No auth required
- Uses org slug from Settings → Clinic Info (booking link)

---

## Superadmin

Platform-level administration at `/superadmin` (no locale).

### Authentication

- PIN-based login (`POST /api/superadmin/auth`)
- Logout: `DELETE /api/superadmin/auth`

### Features

- **Platform stats**: Total orgs, active users, appointments today/month, revenue/month, total patients
- **Organizations list**: Expandable rows with per-org stats
- **Create organization**: name, slug, timezone, currency
- **Suspend organization**: Prevent access
- **Create user**: email, full name, phone, password, within an org
- **View org users**: List users for each org
- **Last activity**: Shows if org had activity in last 24h

### Supported timezones

- Asia/Beirut, UTC, America/New_York, Europe/London, Asia/Dubai, Asia/Riyadh

### Supported currencies

- USD, EUR, GBP, LBP, AED, SAR

---

## Internationalization

- **Locales**: en, fr, ar
- **Default**: en
- **Routing**: `/[locale]/...` (e.g. `/en/scheduling`, `/fr/patients`)
- **RTL**: Arabic uses RTL layout
- **Content**: Services, tags, invoice lines support name_en, name_fr, name_ar

---

## Technical Architecture

### Stack

- **Framework**: Next.js (App Router)
- **Database**: PostgreSQL (via Supabase)
- **ORM**: Drizzle ORM
- **Auth**: Supabase Auth
- **i18n**: next-intl

### Database schema (main tables)

- `organizations`, `users`, `roles`, `permissions`, `role_permissions`, `user_roles`
- `provider_profiles`, `policy_settings`, `payment_methods`, `payments`, `payment_allocations`
- `invoice_sequences`, `invoices`, `invoice_lines`
- `services`, `service_tags`, `tags`
- `patients`, `patient_tags`, `patient_notes`
- `appointments`, `appointment_lines`, `appointment_status_history`, `appointment_checkins`
- `plans`, `plan_items`, `plan_status_history`
- `risk_scores`, `audit_logs`
- `dental_chart`, `dental_xrays`, `patient_medical_history`
- `patient_recalls`, `automation_events`

### API conventions

- RESTful routes under `/api`
- Auth via `withAuth` (and `withPermission`, `withOrgScope`)
- JSON request/response

### Performance

- DB connection pool (size 20, `prepare: true`)
- `getCurrentUser` cached (in-memory, ~30s)
- `Cache-Control` on services and providers GET
- Layout: `revalidate = 60`

### Middleware

- `next-intl` for i18n
- Skips `/api` and `/auth/callback`

---

## API Reference

### Auth & Users

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/auth/me` | GET | Current user and org |
| `/api/users` | GET, POST | List / create users |
| `/api/users/[id]` | PATCH, DELETE | Single user |

### Patients

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/patients` | GET, POST | List / create patients |
| `/api/patients/[id]` | GET, PATCH | Single patient |
| `/api/patients/[id]/stats` | GET | Patient stats |
| `/api/patients/[id]/appointments` | GET | Patient appointments |
| `/api/patients/[id]/notes` | GET, POST | Notes |
| `/api/patients/[id]/notes/[noteId]` | PATCH, DELETE | Single note |
| `/api/patients/[id]/tags` | GET, POST | Tags |
| `/api/patients/inactive` | GET | Inactive patients |

### Dental

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/dental/chart/[patientId]` | GET, POST | Dental chart |
| `/api/dental/xrays/[patientId]` | GET, POST | X-rays list / add |
| `/api/dental/xrays/uploads` | POST | X-ray file upload |
| `/api/dental/medical-history/[patientId]` | GET, POST | Medical history |

### Appointments

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/appointments` | GET, POST | List / create |
| `/api/appointments/[id]` | GET, PATCH, DELETE | Single appointment |
| `/api/appointments/[id]/status` | PATCH | Change status |
| `/api/appointments/[id]/rebook-suggestion` | GET | Rebook suggestions |

### Reception

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/reception/checkin` | GET, POST | Check-in |
| `/api/reception/checkin/[id]` | PATCH | Update check-in |
| `/api/reception/week` | GET | Week view |
| `/api/reception/patient-file/[patientId]` | GET | Patient file |

### Billing & Plans

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/invoices` | GET, POST | Invoices |
| `/api/invoices/[id]` | GET, PATCH | Single invoice |
| `/api/invoices/[id]/status` | PATCH | Status |
| `/api/invoices/[id]/discount` | PATCH | Apply discount |
| `/api/payments` | GET, POST | Payments |
| `/api/plans` | GET, POST | Plans |
| `/api/plans/[id]` | GET, PATCH, DELETE | Single plan |
| `/api/plans/invoice` | POST | Create invoice from plan |

### Reports

| Route | Description |
|-------|-------------|
| `/api/reports/unpaid` | Unpaid invoices |
| `/api/reports/revenue` | Revenue |
| `/api/reports/revenue/by-service` | Revenue by service |
| `/api/reports/revenue/by-provider` | Revenue by provider |
| `/api/reports/patients` | Patient report |
| `/api/reports/providers` | Provider report |
| `/api/reports/appointments` | Appointments report |
| `/api/reports/plan-conversion` | Plan conversion |

### Settings & Reference

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/settings` | GET, PATCH | Org settings |
| `/api/settings/whatsapp-test` | POST | Test WhatsApp |
| `/api/settings/policy` | GET, PATCH | Policy settings |
| `/api/providers` | GET, POST | Providers |
| `/api/services` | GET, POST | Services |
| `/api/services/[id]` | PATCH, DELETE | Single service |
| `/api/tags` | GET, POST | Tags |
| `/api/payment-methods` | GET, POST | Payment methods |

### Other

| Route | Description |
|-------|-------------|
| `/api/dashboard/stats` | Dashboard KPIs |
| `/api/audit-log` | Audit log |
| `/api/automation/trigger` | Run automations |
| `/api/automation/process` | Process queue |
| `/api/automation/events` | Automation events |
| `/api/recalls` | Recalls |

### Public booking

| Route | Description |
|-------|-------------|
| `/api/book/[slug]/providers` | Providers |
| `/api/book/[slug]/services` | Services |
| `/api/book/[slug]/availability` | Availability |
| `/api/book/[slug]/submit` | Submit booking |

---

## Summary Checklist

- [x] Multi-tenant orgs with RLS
- [x] Supabase auth + RBAC
- [x] Dashboard KPIs & activity feed
- [x] Patient CRUD, tags, notes
- [x] No-show risk scoring & at-risk patients
- [x] Day/week scheduling
- [x] Appointments with status workflow
- [x] Plan sessions & auto-invoice on completion
- [x] Invoices: draft → issued → paid/void
- [x] Payments & allocations
- [x] Discounts (with permission for large)
- [x] 8 report types
- [x] Services, providers, policies
- [x] Services with inline edit
- [x] Superadmin (orgs, users, suspend)
- [x] Clinic name editable in settings
- [x] Dental chart, X-rays, medical history
- [x] Reception / check-in
- [x] Automations (reminders, recalls, no-shows)
- [x] Public booking
- [x] i18n (EN, FR, AR)
- [x] Audit logging
