# Schedulix

Schedulix is an intelligent academic timetable generator for configuring, generating, validating, and publishing conflict-aware schedules.

## Problem statement
This project is a production-style MVP for an academic timetable generator that helps administrators manage departments, divisions, subjects, faculty, classrooms, time slots, availability, generation, validation, and publication while preserving a clear audit trail.

## Features
- Department, division, subject, faculty, classroom, and time-slot configuration
- Faculty and classroom availability management
- Hard-constraint timetable generation and validation
- Explainable conflict reporting for impossible scheduling cases
- Manual timetable editing and re-validation
- Timetable versioning and publication flow
- Dashboard summaries and overview cards
- Seeded realistic academic data for demonstration

## Architecture
The application follows a layered structure:

- React frontend for UI and dashboard interactions
- Express backend for REST APIs and business rules
- PostgreSQL/Supabase schema in `database/schema.sql`
- Backend-heavy scheduling and validation logic so the browser never owns the core algorithm

## Technology choices
- Frontend: React + Vite
- Backend: Node.js + Express
- Database: Supabase PostgreSQL
- Validation: custom backend validators and explicit constraint checks
- UI: routed single-page application with reusable cards, tables and forms

## Database design

Run `database/schema.sql` in a Supabase SQL editor to create the persistence layer. The backend loads scheduling data from Supabase when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured. Create matching `auth.users` and `app_users` profiles.
The schema is intentionally normalized and includes tables such as:

- users
- departments
- divisions
- subjects
- faculty
- classrooms
- time_slots
- faculty_availability
- subject_requirements
- timetable_entries
- timetable_versions
- generation_runs
- conflicts
- audit_logs

The project keeps the backend algorithm independent from the actual data store, making migration to Supabase straightforward.

## Timetable generation algorithm
The backend uses a clear, constraint-first generation flow:

1. Load divisions, subjects, faculty, classrooms, and time slots.
2. Build faculty availability and room availability maps.
3. Sort subjects by scheduling pressure.
4. Try valid assignments for each division and subject.
5. Reject any assignment violating hard constraints.
6. Track unresolved conflicts with detailed reasons.
7. Return complete schedule or explain inability to schedule a subject.

## Hard vs. soft constraints
Hard constraints must always be respected:
- Faculty conflict
- Division conflict
- Classroom conflict
- Faculty availability
- Classroom availability
- Room requirement
- Capacity
- Required session counts
- Faculty qualification

Soft constraints are preferred but do not block generation:
- Avoid consecutive sessions
- Spread subjects across different days
- Prefer preferred teaching slots
- Avoid first/last periods when possible

## API overview
Key endpoints:
- GET /api/departments
- GET /api/divisions
- GET /api/subjects
- GET /api/faculty
- GET /api/classrooms
- GET /api/time-slots
- POST /api/timetable/generate
- POST /api/timetable/validate
- GET /api/timetable/current

## Setup instructions
1. Run `database/schema.sql` in the Supabase SQL editor.
2. Configure the variables in `backend/.env.example` for the backend.
3. Copy `frontend/.env.example` to `frontend/.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from Supabase **Project Settings → API**. Never put the service-role key in the frontend.
4. Install dependencies in each package: `cd backend && npm install`, then `cd ../frontend && npm install`.
5. Start the backend with `cd backend && npm run dev` and the frontend with `cd frontend && npm run dev`.
6. Open http://localhost:5173 and sign in with a Supabase Auth user that has an `app_users` profile.

## Authentication
Schedulix uses Supabase Auth for login, signup, logout, password reset, email confirmation, and session persistence. The frontend restores the Supabase session on startup and listens for auth state changes. Express validates the Supabase access token with Supabase before loading the trusted role from `app_users`.

New signups pass `display_name` as Supabase user metadata. The `handle_new_user()` trigger creates the matching `app_users` row with the `VIEWER` role. Signup never accepts a role. Keep email confirmation enabled or disabled according to the Supabase project's Auth settings; when confirmation is enabled, users must verify their email before logging in.

For the evaluation environment, configure `VITE_DEMO_MODE=true` and the six `VITE_DEMO_*` variables in `frontend/.env`. Demo buttons use the same Supabase password login as normal users. To create or update the three demo Auth users and their profiles, configure the backend service-role environment variables and run:

`cd backend && npm run seed:demo-users`

The backend service-role key belongs only in `backend/.env`. Never expose it through Vite or commit either `.env` file.

## Roles and authorization
Roles are stored in `app_users.role` and constrained to `ADMINISTRATOR`, `SCHEDULER`, or `VIEWER`. New accounts always start as `VIEWER`. The frontend uses the trusted profile returned by `/api/auth/me` to display permitted navigation, while every protected Express route checks the same role-derived permission server-side. Row Level Security remains enabled in `database/schema.sql`; profile updates are administrator-only and users cannot change their own role.

## Environment variables
See .env.example for the required environment variables.

## Seed data
The project ships with realistic example data for multiple departments and divisions. The data is designed to demonstrate both valid scheduling and constraint failure scenarios.

## Testing instructions
Run from the repository root:

`cd backend && npm test`

## Runtime flow
The browser signs in with Supabase Auth, restores the Supabase session, and sends the Supabase access token to Express. Express validates the session with Supabase, loads the role from `app_users`, and rejects client-supplied role headers. Scheduling data is read from Supabase, generated entries are independently validated, valid results can be saved as draft versions, and validated drafts can be edited or published.

## Known limitations
- Seed data remains available for direct algorithm tests; configured runtime requests use Supabase.
- The algorithm is functional but deterministic rather than a full optimization engine.

## Future improvements
- Add real Supabase migrations.
- Expand soft constraints and scoring heuristics.
- Build a richer timetable editor and drag-and-drop UX.
- Add audit and history timeline views.
