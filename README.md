# Schedulix — Intelligent Academic Timetable Generator

A production-style MVP for generating, validating, and publishing conflict-aware academic timetables. Schedulix lets administrators configure departments, divisions, subjects, faculty, classrooms, and time slots, then runs a constraint-aware backtracking engine to produce schedules that respect hard constraints while optimising soft preferences.

---

## Problem statement

Academic institutions spend significant time and human effort hand-crafting timetables. Manual scheduling is error-prone: faculty are double-booked, rooms are over-allocated, divisions receive conflicting sessions, and last-minute availability changes break entire schedules. The process lacks explainability — when a schedule is impossible, schedulers cannot see *why* or fix it.

Schedulix addresses this by:

1. Encoding scheduling rules as explicit hard and soft constraints.
2. Using a recursive backtracking algorithm with most-constrained-first ordering to automatically produce valid timetables.
3. Returning explainable conflict reasons when a complete timetable is impossible.
4. Providing an independent validation system for generated schedules and manual edits.
5. Supporting a draft → validate → publish workflow with versioning and RBAC.

---

## What Schedulix does

- **Configuration**: CRUD for departments, divisions, subjects, faculty, classrooms, and time slots.
- **Availability management**: Toggle faculty and room availability per time slot.
- **Assignment management**: Map subjects to divisions and define per-division subject requirements (room type, minimum seats).
- **Timetable generation**: Run the constraint engine to auto-generate a schedule for all configured division-subject pairs.
- **Validation**: Independently validate generated or manually edited timetables against all hard constraints.
- **Conflict reporting**: When generation fails, receive grouped, human-readable conflict reasons.
- **Draft/publish workflow**: Save validated timetables as drafts, publish them, and manage versions.
- **RBAC**: Three roles (Administrator, Scheduler, Viewer) with granular permission gates enforced both frontend and backend.
- **Dashboard**: Summary cards and pipeline visualisation for quick oversight.

---

## Key features

| Feature | Description |
|---|---|
| Hard-constraint generation | Recursive backtracking with most-constrained-first task ordering |
| Explainable failures | Grouped conflict reasons with codes (e.g. `FACULTY_UNAVAILABLE`, `ROOM_CAPACITY`) |
| Independent validation | `TimetableValidator` checks generated entries and manual edits equally |
| Manual editing | Click a session cell, change assignment, re-validate on save; conflicts are rejected |
| Versioning | Each draft/published timetable gets a UUID version with status tracking |
| RBAC | 3 roles, 25 permissions, server-side enforcement on every protected route |
| Supabase integration | PostgreSQL schema with RLS; seed data for demos |
| Demo mode | Pre-seeded demo users for all three roles |

---

## Assumptions

- Each division has a fixed student count.
- Each subject has a fixed number of sessions per week.
- One session occupies exactly one time slot (single period).
- A classroom can host only one division per period.
- A faculty member can teach only one division per period.
- Labs have specific room types (`CLASSROOM` vs `LAB`) and minimum capacities.
- Generation is performed for the full academic schedule at once (all divisions/subjects).
- Timetable entries can be versioned without overwriting prior schedules.
- Generation is deterministic; soft constraints optimise candidate ordering but never override hard constraints.

---

## Architecture

Schedulix follows a layered architecture with domain logic isolated in the backend. The frontend is a thin presentation layer — it never resolves scheduling constraints.

```
                ┌─────────────────────┐
                │   React + Vite UI   │
                │ Dashboard / CRUD    │
                │ Timetable / Auth    │
                └──────────┬──────────┘
                           │
               HTTP (CORS │ auth token)
                           ▼
                ┌─────────────────────┐
                │ Express Backend     │
                │ Auth / RBAC / APIs  │
                └──────────┬──────────┘
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
   ┌──────────────────┐       ┌────────────────────┐
   │ Timetable Engine │       │ Timetable Validator│
   │                  │       │                    │
   │ Backtracking     │       │ Hard constraints   │
   │ Candidate order  │       │ Conflict detection │
   │ Soft scoring     │       │                    │
   └────────┬─────────┘       └─────────┬──────────┘
            │                           │
            └─────────────┬─────────────┘
                          ▼
                ┌─────────────────────┐
                │ Supabase PostgreSQL │
                │ Auth + Data Store   │
                │ RLS + Persistence   │
                └─────────────────────┘
```

**Frontend** (`frontend/src/`): React single-page application with React Router. Renders dashboard, CRUD data pages, availability grids, timetable grid, generation panel, and edit modals. All API calls carry the Supabase access token as a `Bearer` header. The frontend mirrors RBAC to hide irrelevant navigation, but **all enforcement is server-side**.

**Backend** (`backend/src/`): Express API server that authenticates users against Supabase Auth, loads the trusted role from `app_users`, and gates every route with `requirePermission`. The scheduling engine and validator live entirely in the backend so business rules are tested and consistent.

**Data layer** (`database/schema.sql`): Normalized PostgreSQL schema with 17 tables covering configuration, availability, requirements, timetable entries, versions, generation runs, conflicts, and audit logs. Row Level Security (RLS) is enabled on all tables.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, React Router 6 |
| Backend | Node.js 22, Express 4 |
| Database | Supabase PostgreSQL (schema in `database/schema.sql`) |
| Auth | Supabase Auth (email/password, email confirmation, session persistence) |
| API | REST over HTTP with JSON |
| Testing | Node.js built-in test runner (`node --test`) |
| Formatting | Prettier 3 |
| Deployment | Backend on port 4000, frontend on port 5173 |

---

## Database design

The schema (`database/schema.sql`) is intentionally normalized:

### Core configuration tables

| Table | Purpose |
|---|---|
| `app_users` | Supabase Auth user profiles with role (`ADMINISTRATOR`, `SCHEDULER`, `VIEWER`) |
| `departments` | Academic departments (id, name, code) |
| `divisions` | Student groups belonging to a department (with `student_count`) |
| `subjects` | Curriculum items (with `required_sessions`, `room_type`, `capacity`) |
| `faculty` | Teaching staff belonging to a department |
| `classrooms` | Rooms and labs (with `room_type`, `capacity`) |
| `time_slots` | Day + period pairs (e.g. "Monday Period 1") |

### Relationship tables

| Table | Purpose |
|---|---|
| `division_subjects` | Which subjects each division must schedule |
| `faculty_subjects` | Qualifications — which subjects each faculty member can teach |
| `faculty_availability` | Boolean availability per faculty × time slot |
| `room_availability` | Boolean availability per room × time slot |
| `subject_requirements` | Per-division overrides for room type and minimum seats |

### Timetable & audit tables

| Table | Purpose |
|---|---|
| `timetable_versions` | Versioned drafts (draft → validated → published → archived) |
| `timetable_entries` | Individual scheduled sessions belonging to a version |
| `generation_runs` | Metadata about each generation attempt |
| `conflicts` | Stored conflict records with JSONB `details` |
| `audit_logs` | Action log for traceability |

### Key constraints

- `timetable_entries` has composite unique constraints on `(version, division, slot)`, `(version, faculty, slot)`, and `(version, room, slot)` — preventing double-booking at the database level.
- `app_users.role` is a `CHECK` constraint enforcing the three valid roles.
- New signups always default to `VIEWER`; the `handle_new_user()` trigger creates the profile automatically.

---

## Timetable generation algorithm

The generator (`backend/src/algorithms/TimetableGenerator.js`) uses **recursive backtracking** with a **most-constrained-first** strategy:

### Step-by-step flow

1. **Load data**: Divisions, subjects, faculty, classrooms, time slots, availability maps, division-subject assignments, and subject requirements are loaded from Supabase (or seeded data if Supabase is not configured).

2. **Build tasks**: Each division-subject pair is expanded into one task per required weekly session. For example, a subject requiring 3 sessions produces 3 tasks.

3. **Count static possibilities**: For each task, count how many (faculty, room, slot) combinations exist without considering other assignments. This is a static feasibility estimate.

4. **Sort most-constrained-first**: Tasks with fewer possible combinations are scheduled first. Among ties, tasks with more required sessions come first. This makes failures appear earlier and prunes the search tree.

5. **Compute feasible candidates**: For the current task, iterate over sorted time slots and find all valid (faculty, room) pairs that satisfy every hard constraint:
   - Division not already occupied in that slot
   - Faculty qualified, available, and not already teaching
   - Room of correct type, sufficient capacity, available, and not already booked

6. **Score candidates**: Rank feasible candidates using soft preferences (spread sessions across days, avoid consecutive periods, avoid first/last periods, prefer rooms with less wasted capacity, retain faculty with more future availability). Scoring never promotes an invalid candidate.

7. **Recurse**: Place the best-scoring candidate and recursively schedule the next task.

8. **Backtrack**: If no candidate leads to a complete schedule, remove the candidate and try the next one. Track the best partial schedule found.

9. **Return**: `VALID` with all entries if complete, or `INCOMPLETE` with the best partial schedule and grouped conflict reasons explaining what could not be scheduled.

### Why backtracking (not greedy)

A greedy algorithm commits to the first valid choice. That choice may consume the only faculty or room needed by a later task, making the schedule impossible even though a solution exists. Backtracking systematically explores feasible alternatives, allowing the engine to find a complete schedule when one exists under the implemented constraints, or report an incomplete schedule with conflict reasons when no complete assignment is found.

---

## Hard vs soft constraints

### Hard constraints (must always be respected)

| Constraint | Code |
|---|---|
| Division conflict — two sessions in same slot | `DIVISION_CONFLICT` |
| Faculty conflict — one person teaching two divisions | `FACULTY_CONFLICT` |
| Classroom conflict — two sessions in same room | `ROOM_CONFLICT` |
| Faculty unavailable | `FACULTY_UNAVAILABLE` |
| Room unavailable | `ROOM_UNAVAILABLE` |
| Room capacity insufficient | `ROOM_CAPACITY` |
| Room type mismatch | `ROOM_TYPE_MISMATCH` |
| Faculty not qualified | `FACULTY_NOT_QUALIFIED` |
| Required session count per division-subject | `SESSION_COUNT_MISMATCH` |

### Soft constraints (preferred but not blocking)

- Spread repeated sessions across different days
- Avoid consecutive periods for divisions and faculty
- Avoid first and last periods
- Prefer rooms with less unused capacity
- Retain faculty with more future available slots

---

## Recursive backtracking approach

The core algorithm in `TimetableGenerator.backtrack()`:

```javascript
backtrack(tasks, index, slots, state, failureReasons) {
  if (index === tasks.length) return true;           // all tasks scheduled

  const task = tasks[index];
  const { candidates, reasons } = getCandidates(task, slots, state);

  if (candidates.length === 0) {
    failureReasons.set(key, { divisionId, subjectId, requiredSessions, reasons });
    return false;                                     // no valid assignment
  }

  for (const candidate of candidates) {               // best-scoring first
    applyCandidate(task, candidate, state);
    if (this.backtrack(tasks, index + 1, slots, state, failureReasons)) return true;
    removeCandidate(task, candidate, state);         // undo and try next
  }

  // exhausted all candidates → this task cannot be scheduled
  failureReasons.set(key, { divisionId, subjectId, requiredSessions, sessionIndex, reasons });
  return false;
}
```

**State tracking** uses constant-time Sets for collision detection:
- `divisionSlots`: prevents division conflicts
- `facultySlots`: prevents faculty conflicts  
- `roomSlots`: prevents room conflicts
- `subjectDays`: tracks which days a subject has been scheduled (for soft spread)
- `divisionPeriods` / `facultyPeriods`: tracks consecutive-period avoidance (soft)

**Best partial tracking**: `state.bestEntries` is updated whenever the current path schedules more entries than the previous best, so an incomplete schedule still returns the maximum valid prefix.

---

## Most-constrained-first strategy

Tasks are sorted by two criteria before backtracking begins:

1. **Fewest static possibilities** (`getStaticCandidateCount`): A task with fewer valid (faculty, room, slot) combinations is attempted first. If it fails, the failure is detected quickly without wasting computation on flexible tasks.

2. **Most required sessions** (tiebreaker): Among tasks with equal static possibilities, tasks needing more sessions are scheduled first. A 3-session subject is harder to place than a 1-session subject.

This dual-criteria ordering is a standard constraint-propagation heuristic that dramatically reduces the search tree depth.

---

## Validation system

`TimetableValidator` (`backend/src/validators/TimetableValidator.js`) independently validates any set of timetable entries — whether generated or manually edited — by rebuilding collision maps from scratch:

1. **Per-entry checks**: For each entry, resolves the referenced division, subject, faculty, room, and slot. If any reference is missing, reports `INVALID_ASSIGNMENT`.

2. **Assignment-level checks**: For each entry, verifies:
   - Faculty is qualified for the subject (`FACULTY_NOT_QUALIFIED`)
   - Faculty is available in that slot (`FACULTY_UNAVAILABLE`)
   - Room matches required type (`ROOM_TYPE_MISMATCH`)
   - Room has sufficient capacity (`ROOM_CAPACITY`)
   - Room is available in that slot (`ROOM_UNAVAILABLE`)

3. **Collision checks**: Groups entries by (division, slot), (faculty, slot), and (room, slot) keys. Any key with 2+ entries is a conflict (`DIVISION_CONFLICT`, `FACULTY_CONFLICT`, `ROOM_CONFLICT`).

4. **Session-count checks**: Verifies each division-subject pair has exactly the required number of scheduled sessions (`SESSION_COUNT_MISMATCH`).

The validator returns `{ valid: boolean, conflicts: [...] }` where each conflict includes `type`, `severity`, human-readable `message`, and structured `details` (entry IDs, resource IDs, slot IDs, expected/actual counts).

The API uses the validator in three places:
- **Generate**: results are independently validated before returning to the frontend.
- **Save draft**: entries are validated; invalid drafts are rejected with conflict details.
- **Manual edit**: edits are validated; conflicting edits are rejected with conflict details.

---

## Draft/publish workflow

1. **Generate**: Scheduler runs `POST /api/timetable/generate`. The engine returns `VALID` (complete schedule) or `INCOMPLETE` (partial schedule with conflict reasons).

2. **Validate**: The frontend calls `POST /api/timetable/validate` with the generated entries. If validation fails, conflicts are shown.

3. **Save draft**: If valid, `POST /api/timetable/drafts` creates a `timetable_versions` row (status: `draft`) and persists all entries. The version is tracked with a UUID.

4. **Edit**: Scheduler can manually move a session via `PATCH /api/timetable/entries/:versionId/:entryId`. The edit is re-validated before being committed; conflicts are rejected.

5. **Publish**: `POST /api/timetable/publish/:versionId` transitions the version to `published`. The previous published version is archived. Only drafts can be published.

6. **Versions**: `GET /api/timetable/versions` lists all versions with status and session counts.

---

## RBAC / authentication

### Roles

| Role | Permissions | Description |
|---|---|---|
| `VIEWER` | Read-only: dashboard, data views, timetable view, versions, reports | Cannot edit configuration or generate schedules |
| `SCHEDULER` | Viewer + manage availability, subjects, requirements, assignments, faculty, rooms, generate/edit/validate/publish timetables | Full operational access to scheduling |
| `ADMINISTRATOR` | All permissions including user management and settings | Full system administration |

### Authentication flow

1. User signs in via Supabase Auth (email/password, signup, password reset, email confirmation).
2. The Supabase access token is sent to Express as a `Bearer` header.
3. Express validates the token with `supabase.auth.getUser()`.
4. Express loads the trusted role from `app_users` — **client-supplied role headers are ignored**.
5. The role is cached on `req.user` for the request lifetime.

### Authorization

- `requireAuth` middleware validates the Supabase token and loads the user profile.
- `requirePermission(permission)` checks the role against `ROLE_PERMISSIONS`. Both frontend and backend mirror the same permission map (`rbac.js`).
- User role changes are administrator-only and users cannot modify their own role.
- RLS is enabled on all tables in the database, relying on the `current_user_role()` helper function.

---

## Trade-offs

| Decision | Trade-off |
|---|---|
| Backtracking over greedy | Slower on large datasets, but guarantees completeness or explainable failure. A greedy approach would be faster but can produce false impossibilities. |
| Backend-heavy engine | More complex API layer, but keeps validation consistent and testable. The frontend is simpler and cannot drift from server rules. |
| Static availability maps | Simple and fast for the MVP, but requires rebuild when availability changes. A dynamic constraint propagator would be more flexible but significantly more complex. |
| Soft scoring only orders candidates | No global optimisation (e.g. simulated annealing). Good enough for department-sized instances (~30-60 sessions). |
| Seed data fallback | Allows algorithm testing without Supabase, but means CRUD endpoints require a configured instance. |
| RLS + service-role key | Backend uses the service role to bypass RLS for management operations. Client-facing policies should be added for direct DB access. |
| Single-period slots | Simplifies the model but cannot express multi-period blocks (e.g. 2-hour labs). |

---

## Limitations

- The algorithm is deterministic with soft-scoring heuristics, not a full optimisation engine (no simulated annealing, genetic algorithms, or constraint programming).
- Sessions are assumed to be exactly one time slot; multi-period blocks are not supported.
- No soft-constraint scoring is stored or reported; soft preferences only influence candidate ordering.
- The frontend uses seed data locally and only persists to Supabase when configured.
- Generation does not consider cross-department faculty sharing beyond qualifications.
- The backtracking search is single-threaded and synchronous; large datasets may hit timeouts.
- Subject-requirement overrides are per division-subject; no support for group constraints (e.g. "all labs Monday").

---

## How to run

### Prerequisites

- Node.js 22+
- A Supabase project (optional for seed-mode testing)

### Backend

```bash
cd backend
npm install
npm run dev
# Backend starts on http://localhost:4000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# Frontend starts on http://localhost:5173
```

### With Supabase (full functionality)

1. Run `database/schema.sql` in the Supabase SQL editor.
2. Copy `backend/.env.example` to `backend/.env` and fill in `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
3. Copy `frontend/.env.example` to `frontend/.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. (Optional) For demo mode: set `VITE_DEMO_MODE=true` and demo credentials in `frontend/.env`, then run `cd backend && npm run seed:demo-users`.
5. Start both servers and open `http://localhost:5173`.

### Testing

```bash
cd backend
npm test
# 15 tests across timetable generation, validation, and RBAC
```

### Formatting

```bash
cd backend
npm run format        # format all files
npm run format:check  # check formatting without writing
```

---

## Documentation

| Document | Contents |
|---|---|
| [README.md](README.md) | Main technical report and project overview |
| [docs/AI_USAGE_REPORT.md](docs/AI_USAGE_REPORT.md) | AI usage, generated code, corrections, and validation |
| [docs/VALIDATION_AND_EDGE_CASES.md](docs/VALIDATION_AND_EDGE_CASES.md) | Test results, edge cases, conflict codes, and failure handling |
| [docs/DEMO_GUIDE.md](docs/DEMO_GUIDE.md) | Step-by-step evaluator demonstration |
| [database/schema.sql](database/schema.sql) | PostgreSQL schema and RLS policies |
