# Clinic OS

A full-featured ERP system for medical and dental clinics. Multi-tenant, role-based, with scheduling, treatment plans, billing, automations, and public booking.

## Features

| Module | Description |
|--------|-------------|
| **Dashboard** | KPIs, today’s appointments, unpaid summary, at-risk patients, activity feed |
| **Scheduling** | Day/week views, appointment creation, status workflow, rebook suggestions |
| **Patients** | CRUD, tags, notes, no-show risk, dental chart, X-rays, medical history |
| **Plans** | Treatment plans, sessions, progress tracking, auto-invoice on completion |
| **Billing** | Invoices, payments, allocations, discounts, payment methods |
| **Reports** | Revenue, by service/provider, unpaid, appointments, patients, plan conversion |
| **Reception** | Check-in / waiting room, week view |
| **Automations** | Appointment reminders, no-show follow-ups, recalls; WhatsApp integration |
| **Settings** | Services, providers, clinic info (name, booking link), policy settings, WhatsApp |
| **Booking** | Public booking at `/book/[slug]` |
| **Superadmin** | Platform admin: orgs, users, suspend |

## Tech Stack

- **Framework**: Next.js (App Router)
- **Database**: PostgreSQL (Supabase)
- **Auth**: Supabase Auth
- **i18n**: next-intl (EN, FR, AR, RTL for Arabic)

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Log in and use the app under `/[locale]/*` (e.g. `/en/scheduling`).

## Project Structure

```
clinic-os/
├── app/
│   ├── [locale]/(app)/     # Main app pages (dashboard, scheduling, patients, billing, etc.)
│   ├── api/                # REST API routes
│   └── book/[slug]/        # Public booking
├── components/
├── lib/
└── db/
```

## Documentation

- **[SYSTEM_CAPABILITIES.md](./SYSTEM_CAPABILITIES.md)** — Full system specification: features, workflows, API summary, database schema
