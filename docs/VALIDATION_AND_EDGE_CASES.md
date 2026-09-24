# Validation & Edge Cases

## 1. Overview

Schedulix uses multiple validation layers to ensure that generated and manually edited timetables satisfy the defined scheduling constraints.

Validation was performed through:

1. Automated backend tests.
2. Frontend production build validation.
3. Formatting and diagnostics checks.
4. Manual browser validation.
5. Independent timetable validation.

The final backend test suite contains **15 tests**, all of which pass.

---

# 2. Testing Approach

## 2.1 Unit and Algorithm Tests

The backend uses Node.js' built-in test runner:

```bash
cd backend
npm test
```

Final result:

```text
tests 15
pass 15
fail 0
```

The tests cover both normal scheduling and failure scenarios.

---

## 2.2 Frontend Validation

The production frontend was built using:

```bash
cd frontend
npm run build
```

Result:

**Passed**

The build completed successfully without compilation errors.

---

## 2.3 Formatting Validation

Formatting was checked using the project's Prettier configuration.

Result:

**Passed**

All source and documentation files conform to the configured formatting rules.

---

## 2.4 Manual Browser Validation

The following workflows were manually checked:

* Login.
* Role-based navigation.
* Dashboard.
* Configuration management.
* Availability changes.
* Timetable generation.
* Timetable validation.
* Conflict reporting.
* Manual timetable editing.
* Draft creation.
* Publishing.
* Browser refresh.
* Persistent timetable loading.
* Viewer/Scheduler/Administrator permissions.

---

# 3. Hard Constraint Validation

Hard constraints are never overridden by soft scoring.

| Scenario                   | Expected behavior                  | Result |
| -------------------------- | ---------------------------------- | ------ |
| Faculty conflict           | Prevent/detect double booking      | ✅      |
| Division conflict          | Prevent/detect double booking      | ✅      |
| Classroom conflict         | Prevent/detect room double booking | ✅      |
| Faculty unavailable        | Reject faculty assignment          | ✅      |
| Room unavailable           | Reject room assignment             | ✅      |
| Insufficient room capacity | Reject room                        | ✅      |
| Wrong room type            | Reject room                        | ✅      |
| Unqualified faculty        | Reject faculty                     | ✅      |
| Required sessions missing  | Report session-count mismatch      | ✅      |
| Invalid manual edit        | Reject conflicting edit            | ✅      |
| Unauthorized request       | Return 401/403                     | ✅      |

---

# 4. Algorithm Edge Cases

## 4.1 Valid Schedule

When sufficient resources are available:

```text
Status: VALID
```

All required sessions are scheduled and independently validated.

---

## 4.2 Impossible Schedule

When the available resources cannot satisfy the constraints:

```text
Status: INCOMPLETE
```

The generator reports structured reasons instead of silently producing an invalid timetable.

Examples include:

```text
NO_QUALIFIED_FACULTY
FACULTY_UNAVAILABLE
ROOM_CAPACITY
ROOM_TYPE_MISMATCH
ROOM_UNAVAILABLE
DIVISION_OCCUPIED
```

---

## 4.3 Backtracking

A scheduling decision may appear valid initially but prevent a later task from being scheduled.

The generator therefore:

1. Applies a candidate.
2. Recursively schedules the next task.
3. Detects failure.
4. Removes the candidate.
5. Restores the scheduling state.
6. Tries another candidate.

A dedicated test verifies that backtracking occurs and can find an alternative valid solution.

---

## 4.4 Partial Schedule

If a complete schedule cannot be created, Schedulix preserves the best partial schedule found during the search rather than pretending that the schedule is complete.

The system reports:

* scheduled session count;
* required session count;
* incomplete status;
* grouped conflict reasons.

---

## 4.5 Manual Edit Validation

Generated schedules and manually edited schedules use the same validation rules.

The backend re-validates an edit before persisting it.

Therefore a client cannot bypass scheduling constraints simply by submitting a modified timetable payload.

---

# 5. Test-by-Test Coverage

## Timetable Tests

### Test 1 — Valid timetable generation

**Verifies:**

A complete timetable can be generated for explicit division-subject assignments and passes independent validation.

---

### Test 2 — Division-subject assignments

**Verifies:**

Only subjects assigned to a division are scheduled.

Subjects belonging to the department but not assigned to the division are not automatically inserted.

---

### Test 3 — Faculty conflict

**Verifies:**

Two entries using the same faculty member in the same time slot produce:

```text
FACULTY_CONFLICT
```

---

### Test 4 — Classroom conflict

**Verifies:**

Two entries using the same room in the same time slot produce:

```text
ROOM_CONFLICT
```

---

### Test 5 — Division conflict

**Verifies:**

A division cannot attend two sessions during the same time slot.

Result:

```text
DIVISION_CONFLICT
```

---

### Test 6 — Faculty availability and qualification

**Verifies:**

* unavailable faculty cannot be assigned;
* unqualified faculty cannot teach a subject.

Results:

```text
FACULTY_UNAVAILABLE
FACULTY_NOT_QUALIFIED
```

---

### Test 7 — Classroom constraints

**Verifies:**

* room availability;
* room type;
* room capacity.

Possible results:

```text
ROOM_UNAVAILABLE
ROOM_TYPE_MISMATCH
ROOM_CAPACITY
```

---

### Test 8 — Required session count

**Verifies:**

A division-subject assignment must contain the required number of weekly sessions.

Result:

```text
SESSION_COUNT_MISMATCH
```

---

### Test 9 — Impossible schedule

**Verifies:**

An impossible configuration produces:

```text
INCOMPLETE
```

with grouped conflict reasons rather than an invalid schedule.

---

### Test 10 — Partial schedule preservation

**Verifies:**

Entries successfully scheduled before the search becomes impossible are retained as the best partial result.

---

### Test 11 — Backtracking

**Verifies:**

The algorithm can undo an earlier resource assignment and find another valid assignment.

---

### Test 12 — Manual edit validation

**Verifies:**

The independent validator detects conflicts in manually supplied timetable entries.

---

# 6. Authentication and RBAC Tests

Three authentication/RBAC tests verify that protected endpoints cannot be accessed without a valid Supabase session.

### Test 13

Unauthenticated timetable-generation request:

```text
POST /api/timetable/generate
```

Expected:

```text
401 UNAUTHORIZED
```

Result:

✅

---

### Test 14

Unauthenticated user-management request:

```text
POST /api/users
```

Expected:

```text
401 UNAUTHORIZED
```

Result:

✅

---

### Test 15

Unauthenticated user creation request.

Expected:

```text
401 UNAUTHORIZED
```

Result:

✅

---

# 7. Conflict Code Reference

## Generation-time reason codes

| Code                   | Meaning                                               |
| ---------------------- | ----------------------------------------------------- |
| `NO_QUALIFIED_FACULTY` | No qualified faculty member exists                    |
| `FACULTY_UNAVAILABLE`  | Qualified faculty cannot teach during available slots |
| `FACULTY_OCCUPIED`     | Qualified faculty are already scheduled               |
| `ROOM_TYPE_MISMATCH`   | Required room type is unavailable                     |
| `ROOM_CAPACITY`        | Suitable rooms do not have sufficient capacity        |
| `ROOM_UNAVAILABLE`     | Suitable room is unavailable                          |
| `ROOM_OCCUPIED`        | Suitable rooms are already occupied                   |
| `DIVISION_OCCUPIED`    | Division already has a session in that slot           |

---

## Validation conflict codes

| Code                     | Severity | Meaning                             |
| ------------------------ | -------- | ----------------------------------- |
| `INVALID_ASSIGNMENT`     | HIGH     | Referenced entity does not exist    |
| `FACULTY_NOT_QUALIFIED`  | HIGH     | Faculty is not qualified            |
| `FACULTY_UNAVAILABLE`    | HIGH     | Faculty is unavailable              |
| `ROOM_TYPE_MISMATCH`     | HIGH     | Room type is incorrect              |
| `ROOM_CAPACITY`          | HIGH     | Room capacity is insufficient       |
| `ROOM_UNAVAILABLE`       | HIGH     | Room is unavailable                 |
| `DIVISION_CONFLICT`      | HIGH     | Division is double-booked           |
| `FACULTY_CONFLICT`       | HIGH     | Faculty is double-booked            |
| `ROOM_CONFLICT`          | HIGH     | Room is double-booked               |
| `SESSION_COUNT_MISMATCH` | HIGH     | Required sessions are not satisfied |

---

# 8. Independent Validator

The `TimetableValidator` does not assume that the generator produced a correct result.

It independently:

1. Rebuilds occupancy maps.
2. Checks faculty conflicts.
3. Checks division conflicts.
4. Checks room conflicts.
5. Checks faculty availability.
6. Checks room availability.
7. Checks room capacity.
8. Checks room type.
9. Checks faculty qualification.
10. Checks session counts.

This provides a second layer of protection between timetable generation and persistence.

---

# 9. Final Validation Results

| Validation                     | Result           |
| ------------------------------ | ---------------- |
| Backend tests                  | **15/15 passed** |
| Frontend production build      | **Passed**       |
| Prettier check                 | **Passed**       |
| Backend diagnostics            | **Clean**        |
| Manual generation validation   | **Passed**       |
| Manual conflict validation     | **Passed**       |
| Manual edit validation         | **Passed**       |
| RBAC validation                | **Passed**       |
| Persistence/refresh validation | **Passed**       |

The final implementation was validated against both successful and intentionally impossible scheduling scenarios.
