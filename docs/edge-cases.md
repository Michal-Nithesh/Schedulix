# Edge cases and conflict codes

Generation returns `valid: false`, `status: 'INCOMPLETE'`, an empty `entries` array, and grouped reasons when no complete schedule exists. Typical reason codes include:

- `NO_QUALIFIED_FACULTY`
- `FACULTY_UNAVAILABLE`
- `FACULTY_OCCUPIED`
- `ROOM_TYPE_MISMATCH`
- `ROOM_CAPACITY`
- `ROOM_UNAVAILABLE`
- `ROOM_OCCUPIED`
- `DIVISION_OCCUPIED`

Independent validation returns these hard-constraint codes:

- `DIVISION_CONFLICT`
- `FACULTY_CONFLICT`
- `ROOM_CONFLICT`
- `FACULTY_UNAVAILABLE`
- `ROOM_UNAVAILABLE`
- `ROOM_CAPACITY`
- `ROOM_TYPE_MISMATCH`
- `FACULTY_NOT_QUALIFIED`
- `SESSION_COUNT_MISMATCH`

Conflict records include the affected resource, time slot, entry IDs where applicable, and a message. Reasons are grouped by type so an impossible schedule does not produce one duplicate error for every equivalent slot.
