export class TimetableValidator {
  constructor({ entries = [], facultyAvailabilityMap = {}, classrooms = [], divisions = [], subjects = [], requiredSessionsMap = {}, roomAvailability = {} }) {
    this.entries = entries;
    this.facultyAvailabilityMap = facultyAvailabilityMap;
    this.classrooms = classrooms;
    this.divisions = divisions;
    this.subjects = subjects;
    this.requiredSessionsMap = requiredSessionsMap;
    this.roomAvailability = roomAvailability;
  }

  validate() {
    const conflicts = [];
    const byDivision = new Map();
    const byFaculty = new Map();
    const byRoom = new Map();

    for (const entry of this.entries) {
      const division = this.divisions.find((item) => item.id === entry.divisionId);
      const subject = this.subjects.find((item) => item.id === entry.subjectId);
      const room = this.classrooms.find((item) => item.id === entry.roomId);

      if (!division || !subject || !room) {
        conflicts.push({
          type: 'INVALID_ASSIGNMENT',
          severity: 'HIGH',
          message: 'Entry references missing data.',
          entry,
        });
        continue;
      }

      if (this.facultyAvailabilityMap[entry.facultyId]?.[entry.timeSlotId] === false) {
        conflicts.push({
          type: 'FACULTY_UNAVAILABLE',
          severity: 'HIGH',
          facultyId: entry.facultyId,
          timeSlotId: entry.timeSlotId,
          message: 'Faculty is unavailable during this slot.',
        });
      }

      if (room.capacity < division.studentCount) {
        conflicts.push({
          type: 'CAPACITY_VIOLATION',
          severity: 'HIGH',
          roomId: room.id,
          divisionId: division.id,
          message: 'Classroom capacity is below division size.',
        });
      }

      if (!subject.roomType || room.roomType !== subject.roomType) {
        conflicts.push({
          type: 'ROOM_TYPE_VIOLATION',
          severity: 'HIGH',
          roomId: room.id,
          subjectId: subject.id,
          message: 'Assigned room does not satisfy the subject requirement.',
        });
      }

      if (this.roomAvailability[room.id]?.[entry.timeSlotId] === false) {
        conflicts.push({
          type: 'CLASSROOM_UNAVAILABLE',
          severity: 'HIGH',
          roomId: room.id,
          timeSlotId: entry.timeSlotId,
          message: 'Classroom is unavailable during this slot.',
        });
      }

      const divisionMap = byDivision.get(`${entry.divisionId}-${entry.timeSlotId}`) || [];
      divisionMap.push(entry);
      byDivision.set(`${entry.divisionId}-${entry.timeSlotId}`, divisionMap);

      const facultyMap = byFaculty.get(`${entry.facultyId}-${entry.timeSlotId}`) || [];
      facultyMap.push(entry);
      byFaculty.set(`${entry.facultyId}-${entry.timeSlotId}`, facultyMap);

      const roomMap = byRoom.get(`${entry.roomId}-${entry.timeSlotId}`) || [];
      roomMap.push(entry);
      byRoom.set(`${entry.roomId}-${entry.timeSlotId}`, roomMap);
    }

    for (const [key, items] of byDivision.entries()) {
      if (items.length > 1) {
        conflicts.push({
          type: 'DIVISION_CONFLICT',
          severity: 'HIGH',
          key,
          message: 'A division is assigned multiple subjects in the same slot.',
          entries: items,
        });
      }
    }

    for (const [key, items] of byFaculty.entries()) {
      if (items.length > 1) {
        conflicts.push({
          type: 'FACULTY_CONFLICT',
          severity: 'HIGH',
          key,
          message: 'Faculty is assigned to multiple divisions in the same slot.',
          entries: items,
        });
      }
    }

    for (const [key, items] of byRoom.entries()) {
      if (items.length > 1) {
        conflicts.push({
          type: 'CLASSROOM_CONFLICT',
          severity: 'HIGH',
          key,
          message: 'Room is assigned to multiple divisions in the same slot.',
          entries: items,
        });
      }
    }

    for (const [subjectId, expectedCount] of Object.entries(this.requiredSessionsMap)) {
      const scheduledCount = this.entries.filter((entry) => entry.subjectId === subjectId).length;
      if (scheduledCount !== expectedCount) {
        conflicts.push({
          type: 'SESSION_COUNT_MISMATCH',
          severity: 'MEDIUM',
          subjectId,
          expectedCount,
          actualCount: scheduledCount,
          message: 'The required weekly sessions count was not met.',
        });
      }
    }

    return {
      valid: conflicts.length === 0,
      conflicts,
    };
  }
}
