# Schedulix Demo & Evaluation Guide

## 1. Purpose

This guide provides a short walkthrough for evaluating Schedulix, an intelligent timetable generation system designed for academic scheduling.

The recommended demonstration takes approximately **5–10 minutes**.

---

# 2. Prerequisites

Start the backend:

```bash
cd backend
npm run dev
```

Start the frontend:

```bash
cd frontend
npm run dev
```

The frontend runs on:

```text
http://localhost:5173
```

The backend runs on:

```text
http://localhost:4000
```

For the complete workflow, Supabase should be configured.

---

# 3. Demo Flow

```text
Login
  ↓
Dashboard
  ↓
Configure academic data
  ↓
Configure availability
  ↓
Generate timetable
  ↓
Validate
  ↓
View timetable
  ↓
Demonstrate conflict scenario
  ↓
Edit timetable
  ↓
Save draft
  ↓
Publish
  ↓
Refresh
  ↓
Demonstrate RBAC
  ↓
Explain architecture and algorithm
```

---

# 4. Step 1 — Login

Open:

```text
http://localhost:5173
```

Sign in using a configured account.

After login, verify:

* authentication succeeds;
* the user identity is displayed;
* the user's role is shown;
* navigation reflects the user's permissions.

Roles supported:

```text
ADMINISTRATOR
SCHEDULER
VIEWER
```

---

# 5. Step 2 — Dashboard

Open the dashboard.

Verify the displayed academic statistics:

* Departments
* Divisions
* Faculty
* Subjects
* Classrooms
* Scheduled sessions

The dashboard also represents the timetable workflow:

```text
Configure → Generate → Validate → Publish
```

The purpose of the dashboard is to give the scheduler a quick overview of the current timetable state.

---

# 6. Step 3 — Show Configuration Data

Navigate through the configuration screens.

## Departments

Verify departments are displayed.

Administrator users can create, edit, and delete departments.

---

## Divisions

Verify:

* division name;
* department;
* student count.

The student count is important because it affects classroom capacity requirements.

---

## Subjects

Verify:

* subject name;
* required sessions;
* room type;
* capacity.

Examples include classroom subjects and laboratory subjects.

---

## Faculty

Verify:

* faculty members;
* department;
* subject qualifications.

Faculty qualification determines which subjects a faculty member can teach.

---

## Classrooms

Verify:

* room name;
* room type;
* capacity.

Examples:

```text
CLASSROOM
LAB
```

---

# 7. Step 4 — Availability

Open the availability configuration.

The system supports:

* faculty availability;
* classroom availability;
* time slots.

Toggle an availability value and verify that the change persists.

Availability is treated as a hard scheduling constraint.

For example:

```text
Faculty unavailable
        ↓
Faculty cannot be assigned
        ↓
Candidate rejected
```

---

# 8. Step 5 — Generate Timetable

Open the timetable generation page.

Select the required department/configuration.

Click:

```text
Generate timetable
```

The interface displays generation progress such as:

```text
Generating timetable...
Checking constraints...
```

The backend then:

1. Builds scheduling tasks.
2. Counts candidate possibilities.
3. Orders tasks using most-constrained-first.
4. Generates feasible candidates.
5. Applies soft scoring.
6. Recursively schedules candidates.
7. Backtracks when necessary.
8. Returns the generated result.

---

# 9. Step 6 — View Generated Timetable

Open the timetable view.

Verify that sessions are displayed by:

```text
Day
↓
Period
↓
Division
↓
Subject
↓
Faculty
↓
Classroom
```

A valid timetable should satisfy all hard constraints.

The timetable should not contain:

* faculty conflicts;
* division conflicts;
* room conflicts;
* unavailable resources;
* insufficient rooms;
* incorrect room types;
* unqualified faculty assignments.

---

# 10. Step 7 — Show Validation

The timetable is independently validated after generation.

The validator checks the generated entries separately from the generator.

A successful result is represented as:

```text
VALID
```

The validator checks:

```text
Faculty
Division
Room
Availability
Capacity
Room type
Qualification
Session count
```

---

# 11. Step 8 — Demonstrate an Impossible Schedule

This is an important part of the demonstration.

Modify the configuration so that a valid schedule becomes difficult or impossible.

Examples:

### Example 1 — Remove faculty availability

Make a required faculty member unavailable for the remaining slots.

### Example 2 — Remove room capacity

Make all suitable rooms too small for a division.

### Example 3 — Remove qualification

Remove the only faculty qualification for a required subject.

Then generate the timetable again.

The system should not silently create an invalid timetable.

Instead, it reports:

```text
INCOMPLETE
```

and provides structured conflict reasons.

Examples:

```text
NO_QUALIFIED_FACULTY
FACULTY_UNAVAILABLE
ROOM_CAPACITY
ROOM_TYPE_MISMATCH
ROOM_UNAVAILABLE
DIVISION_OCCUPIED
```

This demonstrates the explainability of the scheduling engine.

---

# 12. Step 9 — Show Conflict Details

Open the conflict/result section.

The system groups equivalent conflict reasons instead of displaying a large number of duplicate messages.

A conflict contains information such as:

* conflict type;
* severity;
* affected resource;
* time slot;
* entry IDs where applicable;
* human-readable message.

This allows a scheduler to understand why a schedule could not be completed.

---

# 13. Step 10 — Manual Timetable Editing

Open an existing timetable.

Select a timetable entry and choose an alternative:

* time slot;
* room;
* faculty/resource where supported.

Click:

```text
Validate and save
```

The backend re-validates the change before persistence.

### Valid edit

The change is saved.

### Invalid edit

The API rejects the change and returns structured conflict details.

This ensures that manual editing cannot bypass the scheduling rules.

---

# 14. Step 11 — Draft Workflow

After generating or editing a timetable, save it as a draft.

The timetable version is persisted with:

```text
status = draft
```

The version history records the timetable version.

Previous versions are not overwritten.

---

# 15. Step 12 — Publish

Publish the validated timetable.

The current version becomes:

```text
published
```

The version history records the publication.

Previous published versions can be retained as archived versions.

This provides a basic versioned workflow rather than modifying a single timetable permanently.

---

# 16. Step 13 — Refresh Persistence

Perform a hard browser refresh.

Verify that:

* the timetable remains available;
* the selected version remains available;
* timetable entries are restored;
* publication status is preserved.

This demonstrates that the application is backed by persistent Supabase data rather than only browser state.

---

# 17. Step 14 — Demonstrate RBAC

Test different roles.

## Administrator

Can manage:

* users;
* academic configuration;
* timetable generation;
* timetable editing;
* publishing.

---

## Scheduler

Can perform scheduling and master-data configuration permitted by the application's RBAC rules, but cannot perform administrator-only user management.

---

## Viewer

Viewer access is read-only.

The Viewer should not be able to:

```text
Generate timetable
Modify configuration
Manage users
Modify timetable
Publish changes
```

Protected API endpoints enforce authorization on the backend rather than relying only on frontend navigation.

---

# 18. Step 15 — Explain the Architecture

Use the architecture diagram from the main README.

The system follows:

```text
React Frontend
      ↓
Express Backend
      ↓
Business Logic
      ↓
Supabase PostgreSQL + Auth
```

The most important design decision is that timetable constraint resolution occurs in the backend.

The frontend is responsible for presentation and interaction, while the backend remains the authority for scheduling and validation.

---

# 19. Step 16 — Explain the Scheduling Algorithm

The scheduler uses recursive backtracking.

The process is:

```text
Create scheduling tasks
        ↓
Count possible candidates
        ↓
Most-constrained-first ordering
        ↓
Find feasible candidates
        ↓
Apply soft scoring
        ↓
Choose candidate
        ↓
Recursive call
        ↓
Success?
   ↙          ↘
 YES          NO
  ↓            ↓
Continue    Backtrack
             ↓
        Restore state
             ↓
        Try next candidate
```

### Hard constraints

These determine whether a candidate is allowed.

Examples:

* faculty availability;
* room availability;
* faculty qualification;
* room capacity;
* room type;
* division conflict;
* faculty conflict;
* room conflict.

### Soft constraints

These only influence which valid candidate is tried first.

Examples:

* spreading sessions across days;
* avoiding consecutive periods;
* avoiding first/last periods;
* minimizing unused room capacity;
* preserving future faculty availability.

A soft score can never make a hard-invalid candidate valid.

---

# 20. Step 17 — Explain Independent Validation

The generator does not certify its own output.

The independent `TimetableValidator` rebuilds the relevant state and validates the timetable separately.

This provides an additional safety layer:

```text
Generator
    ↓
Generated entries
    ↓
Independent Validator
    ↓
VALID / CONFLICTS
```

The same validator is used for manually edited entries.

---

# 21. Final Automated Validation

Run:

```bash
cd backend
npm test
```

Expected result:

```text
tests 15
pass 15
fail 0
```

Then:

```bash
cd frontend
npm run build
```

Expected:

```text
Production build successful
```

Formatting:

```bash
cd backend
npm run format:check
```

Expected:

```text
All files formatted
```

---

# 22. Key Points to Explain During Evaluation

If asked why recursive backtracking was selected:

> A greedy scheduler can make a locally valid choice that consumes a resource required by a later task. Backtracking allows the system to undo that decision and try another valid assignment.

If asked why most-constrained-first is used:

> Scheduling the tasks with fewer available choices first causes impossible situations to be discovered earlier and reduces unnecessary search.

If asked why hard and soft constraints are separated:

> Hard constraints represent correctness and can never be violated. Soft constraints represent preferences and only influence the ordering of already-valid candidates.

If asked why there is an independent validator:

> The generator should not be the only component responsible for determining whether its own output is correct. The validator provides an independent check and is also reused for manual timetable edits.

If asked how failures are handled:

> The system does not silently return an invalid timetable. It returns an incomplete status with structured conflict reasons that explain which resources or constraints prevented completion.

If asked how AI-generated code was validated:

> Generated code was compared against the actual database schema and product requirements, then tested through automated tests and manual browser validation. Incorrect assumptions were identified and corrected before the final implementation.

---

# 23. Final Project Validation

| Area                         | Result           |
| ---------------------------- | ---------------- |
| Timetable generation         | ✅                |
| Recursive backtracking       | ✅                |
| Hard constraints             | ✅                |
| Soft constraints             | ✅                |
| Independent validation       | ✅                |
| Conflict reporting           | ✅                |
| Partial/incomplete schedules | ✅                |
| Manual editing               | ✅                |
| Draft/publish workflow       | ✅                |
| Persistence                  | ✅                |
| Authentication               | ✅                |
| RBAC                         | ✅                |
| CRUD configuration           | ✅                |
| Backend tests                | **15/15 passed** |
| Frontend build               | **Passed**       |
| Formatting                   | **Passed**       |

Schedulix is intended to provide an explainable scheduling workflow rather than simply producing a timetable: it configures academic resources, searches for a feasible schedule, validates the result independently, explains conflicts when scheduling is impossible, and supports controlled editing and publishing.
