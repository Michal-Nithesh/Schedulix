# Edge cases and known constraints

- No faculty available for a required subject and slot combination.
- Required lab slots are unavailable due to room assignment conflicts.
- Subject session count exceeds the number of feasible slots in a week.
- Division-specific conflicts due to overlapping time slots.
- Invalid room type or insufficient classroom capacity.
- Manual editing that introduces overlapping faculty or room assignments.

The backend conflict model should always return structured reasons rather than a vague failure message.
