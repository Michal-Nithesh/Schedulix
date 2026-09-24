# Timetable generation algorithm

## Data model
Division enrollment is explicit in `divisionSubjects`:

```js
{
	'div-cse-a': [{ subjectId: 'sub-ds' }, { subjectId: 'sub-dbms' }]
}
```

The subject keeps its canonical `requiredSessions` value. An assignment may override it when a division has a different requirement. This matches the database relationship between `divisions` and `subjects` without duplicating normal session counts.

## Generation
`TimetableGenerator` creates assignments; it does not certify them. It expands each division-subject assignment into one task per required weekly session and then:

1. Builds constant-time occupancy sets for division-slot, faculty-slot, and room-slot keys.
2. Counts static possibilities for every task.
3. Sorts tasks most-constrained-first. A task with fewer possible faculty/room/slot combinations is attempted earlier, which makes failures appear sooner and reduces search.
4. Computes feasible candidates using hard constraints.
5. Scores feasible candidates using only soft preferences.
6. Applies a candidate and recursively schedules the next task.
7. Removes the candidate when a later task fails, then tries the next candidate.
8. Returns `VALID` with all entries, or `INCOMPLETE` with no entries and grouped `NO_VALID_SCHEDULE` reasons.

The previous greedy implementation committed to the first local choice. That can consume the only faculty or room option needed by a later subject. Backtracking restores the prior state and tries the alternative assignment.

## Hard constraints
Hard constraints are checked before scoring and can never be traded away:

- Division conflict
- Faculty conflict
- Classroom conflict
- Faculty availability
- Classroom availability
- Classroom capacity
- Classroom type/room requirement
- Faculty qualification
- Required session count per division and subject

## Soft scoring
Higher candidate scores are preferred, but scoring never makes an invalid candidate eligible. The current score prefers:

- spreading repeated sessions across days;
- avoiding consecutive periods for divisions and faculty;
- avoiding first and last periods;
- using a room with less unused capacity;
- retaining faculty with more future available slots.

## Validation
`TimetableValidator.validate(entries)` independently rebuilds collision maps and checks every hard constraint. It accepts generated entries and manual edits equally, returning structured conflicts with `type`, `severity`, identifiers, entry IDs, and a human-readable message.
