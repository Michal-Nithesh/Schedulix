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

Run `database/schema.sql` in a Supabase SQL editor to create the persistence layer. The backend currently uses in-memory seed data, so applying this schema does not change runtime behavior until a repository layer is connected.
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
1. Install dependencies in each package: `cd backend && npm install`, then `cd ../frontend && npm install`.
2. Start the backend with `cd backend && npm run dev`.
3. Start the frontend with `cd frontend && npm run dev`.
4. Open http://localhost:5173

## Environment variables
See .env.example for the required environment variables.

## Seed data
The project ships with realistic example data for multiple departments and divisions. The data is designed to demonstrate both valid scheduling and constraint failure scenarios.

## Testing instructions
Run from the repository root:

`cd backend && npm test`

## Known limitations
- This MVP uses in-memory seed data rather than a live Supabase instance.
- Authentication is intentionally lightweight for MVP and should be expanded before production use.
- The algorithm is functional but deterministic rather than a full optimization engine.

## Future improvements
- Add real Supabase migrations and RLS policies.
- Introduce role-aware auth and admin authorization.
- Expand soft constraints and scoring heuristics.
- Build a richer timetable editor and drag-and-drop UX.
- Add audit and history timeline views.
