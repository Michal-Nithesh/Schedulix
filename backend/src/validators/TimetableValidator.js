export class TimetableValidator {
  constructor({
    entries = [],
    facultyAvailabilityMap = {},
    classrooms = [],
    divisions = [],
    subjects = [],
    faculty = [],
    timeSlots = [],
    requiredSessionsMap = {},
    subjectRequirementsMap = {},
    divisionSubjects = {},
    roomAvailability = {},
  } = {}) {
    this.entries = entries;
    this.facultyAvailabilityMap = facultyAvailabilityMap;
    this.classrooms = classrooms;
    this.divisions = divisions;
    this.subjects = subjects;
    this.faculty = faculty;
    this.timeSlots = timeSlots;
    this.requiredSessionsMap = requiredSessionsMap;
    this.subjectRequirementsMap = subjectRequirementsMap;
    this.divisionSubjects = divisionSubjects;
    this.roomAvailability = roomAvailability;
  }

  validate(entries = this.entries) {
    const conflicts = [];
    const byDivision = new Map();
    const byFaculty = new Map();
    const byRoom = new Map();

    for (const entry of entries) {
      const division = this.divisions.find((item) => item.id === entry.divisionId);
      const subject = this.subjects.find((item) => item.id === entry.subjectId);
      const faculty = this.getFaculty(entry.facultyId);
      const room = this.classrooms.find((item) => item.id === entry.roomId);
      const slot = this.timeSlots.length ? this.timeSlots.find((item) => item.id === entry.timeSlotId) : true;

      if (!division || !subject || !room || !slot) {
        conflicts.push(this.conflict('INVALID_ASSIGNMENT', 'Entry references missing division, subject, faculty, room, or time slot.', { entryIds: [entry.id], entry }));
        continue;
      }

      this.addToMap(byDivision, this.key(entry.divisionId, entry.timeSlotId), entry);
      this.addToMap(byFaculty, this.key(entry.facultyId, entry.timeSlotId), entry);
      this.addToMap(byRoom, this.key(entry.roomId, entry.timeSlotId), entry);

      if (this.faculty.length > 0 && !faculty.qualifications?.includes(subject.id)) {
        conflicts.push(this.conflict('FACULTY_NOT_QUALIFIED', `Faculty ${faculty.name} is not qualified for ${subject.name}.`, { facultyId: faculty.id, subjectId: subject.id, timeSlotId: entry.timeSlotId, entryIds: [entry.id] }));
      }

      if (this.facultyAvailabilityMap[faculty.id]?.[entry.timeSlotId] === false) {
        conflicts.push(this.conflict('FACULTY_UNAVAILABLE', `Faculty ${faculty.name} is unavailable during this slot.`, { facultyId: faculty.id, timeSlotId: entry.timeSlotId, entryIds: [entry.id] }));
      }

      const requirement = this.getSubjectRequirement(subject.id, division.id);
      if (room.roomType !== requirement.roomType) {
        conflicts.push(this.conflict('ROOM_TYPE_MISMATCH', `Room ${room.name} does not satisfy the ${requirement.roomType} requirement.`, { roomId: room.id, subjectId: subject.id, timeSlotId: entry.timeSlotId, entryIds: [entry.id] }));
      }

      if (Number(room.capacity) < Math.max(Number(division.studentCount), requirement.requiredSeats)) {
        conflicts.push(this.conflict('ROOM_CAPACITY', `Room ${room.name} cannot fit ${division.studentCount} students.`, { roomId: room.id, divisionId: division.id, entryIds: [entry.id] }));
      }

      if (this.roomAvailability[room.id]?.[entry.timeSlotId] === false) {
        conflicts.push(this.conflict('ROOM_UNAVAILABLE', `Room ${room.name} is unavailable during this slot.`, { roomId: room.id, timeSlotId: entry.timeSlotId, entryIds: [entry.id] }));
      }
    }

    this.addCollisionConflicts(conflicts, byDivision, 'DIVISION_CONFLICT', 'A division is assigned multiple subjects in the same slot.', 'divisionId');
    this.addCollisionConflicts(conflicts, byFaculty, 'FACULTY_CONFLICT', 'Faculty is assigned to multiple divisions in the same slot.', 'facultyId');
    this.addCollisionConflicts(conflicts, byRoom, 'ROOM_CONFLICT', 'A classroom is assigned to multiple divisions in the same slot.', 'roomId');
    this.addSessionCountConflicts(conflicts, entries);

    return { valid: conflicts.length === 0, conflicts };
  }

  getFaculty(facultyId) {
    return this.faculty.find((member) => member.id === facultyId) || { id: facultyId, name: facultyId, qualifications: null };
  }

  getSubjectRequirement(subjectId, divisionId) {
    const record = Array.isArray(this.subjectRequirementsMap)
      ? this.subjectRequirementsMap.find((item) => item.subjectId === subjectId && (!item.divisionId || item.divisionId === divisionId))
      : this.subjectRequirementsMap[`${subjectId}:${divisionId}`] || this.subjectRequirementsMap[subjectId];
    const subject = this.subjects.find((item) => item.id === subjectId);
    return {
      roomType: record?.requiredRoomType || record?.roomType || subject?.roomType || 'CLASSROOM',
      requiredSeats: Number(record?.requiredSeats || subject?.capacity || 0),
    };
  }

  getAssignmentsForDivision(division) {
    if (this.divisionSubjects?.[division.id]) return this.divisionSubjects[division.id];
    return this.subjects.filter((subject) => subject.departmentId === division.departmentId).map((subject) => ({ subjectId: subject.id }));
  }

  getRequiredSessions(division, assignment) {
    const subject = this.subjects.find((item) => item.id === assignment.subjectId);
    const requirement = Array.isArray(this.subjectRequirementsMap)
      ? this.subjectRequirementsMap.find((item) => item.subjectId === assignment.subjectId && item.divisionId === division.id)
      : null;
    return Number(assignment.requiredSessions || requirement?.requiredSessions || subject?.requiredSessions || 1);
  }

  addSessionCountConflicts(conflicts, entries) {
    if (Object.keys(this.divisionSubjects).length === 0 && Object.keys(this.requiredSessionsMap).length > 0) {
      for (const [subjectId, expectedCount] of Object.entries(this.requiredSessionsMap)) {
        const actualCount = entries.filter((entry) => entry.subjectId === subjectId).length;
        if (actualCount !== Number(expectedCount)) {
          conflicts.push(this.conflict('SESSION_COUNT_MISMATCH', `Expected ${expectedCount} sessions for ${subjectId}, found ${actualCount}.`, { subjectId, expectedCount: Number(expectedCount), actualCount }));
        }
      }
      return;
    }

    for (const division of this.divisions) {
      for (const assignment of this.getAssignmentsForDivision(division)) {
        const expectedCount = this.getRequiredSessions(division, assignment);
        const actualCount = entries.filter((entry) => entry.divisionId === division.id && entry.subjectId === assignment.subjectId).length;
        if (actualCount !== expectedCount) {
          conflicts.push(this.conflict('SESSION_COUNT_MISMATCH', `Expected ${expectedCount} sessions for ${assignment.subjectId} in ${division.name}, found ${actualCount}.`, { divisionId: division.id, subjectId: assignment.subjectId, expectedCount, actualCount }));
        }
      }
    }
  }

  addToMap(map, key, entry) {
    const entries = map.get(key) || [];
    entries.push(entry);
    map.set(key, entries);
  }

  addCollisionConflicts(conflicts, map, type, message, resourceName) {
    for (const [key, entries] of map.entries()) {
      if (entries.length < 2) continue;
      const [resourceId, timeSlotId] = key.split(':');
      conflicts.push(this.conflict(type, message, {
        [`${resourceName}`]: resourceId,
        timeSlotId,
        entryIds: entries.map((entry) => entry.id),
      }));
    }
  }

  key(resourceId, timeSlotId) {
    return `${resourceId}:${timeSlotId}`;
  }

  conflict(type, message, details = {}) {
    return { type, severity: 'HIGH', message, ...details };
  }
}
