# Timetable generation algorithm

## Overview
The scheduling engine uses a constraint-first, deterministic backtracking-style approach that attempts to place each required subject session while maintaining hard constraints.

## Process
1. Load divisions, faculty, classrooms, and slots.
2. Build availability lookup maps.
3. For each division, sort subjects by required session count.
4. For each subject, iterate through available time slots.
5. Skip any slot with faculty/unavailability or room conflicts.
6. Place the first feasible faculty-room pairing for the slot.
7. Continue until the required session count is met.
8. If a subject cannot be placed, produce a conflict record describing why.

## Hard constraints considered
- Faculty conflict
- Division conflict
- Classroom conflict
- Availability
- Capacity
- Room requirement
- Subject qualification
- Required sessions

## Soft constraints
Soft constraints are intentionally separated from hard constraints because they are preferred but not mandatory. They can be introduced later through weighted scoring without changing failure semantics.
