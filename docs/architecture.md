# Architecture overview

This project uses a layered architecture intentionally aligned to the assignment brief:

- Frontend: React + Vite routes for dashboard and admin screens
- Backend API: Express services coordinating validation and generation
- Business logic: generator, validator, conflict model, and version logic
- Data layer: Supabase-ready schema and seed data for realistic academic configurations

The most important design decision is to keep the timetable engine in the backend. The frontend exposes schedules and metadata, but it should never be the authority for constraint resolution.

## Core modules
- algorithms/TimetableGenerator.js
- validators/TimetableValidator.js
- data/seedData.js
- routes/api.js
- utils/apiResponse.js

## Rationale
- Keeps domain logic testable in isolation
- Makes conflict explanation easier to debug
- Enables future migration to Supabase without changing business logic
- Reduces UI complexity and keeps validation consistent
