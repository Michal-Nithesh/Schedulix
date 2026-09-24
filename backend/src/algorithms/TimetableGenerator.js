const dayOrder = new Map([
  ['Monday', 1],
  ['Tuesday', 2],
  ['Wednesday', 3],
  ['Thursday', 4],
  ['Friday', 5],
  ['Saturday', 6],
  ['Sunday', 7],
]);

export class TimetableGenerator {
  constructor({
    divisions = [],
    subjects = [],
    faculty = [],
    classrooms = [],
    timeSlots = [],
    facultyAvailabilityMap = {},
    subjectRequirementsMap = {},
    roomAvailability = {},
    divisionSubjects = {},
  }) {
    this.divisions = divisions;
    this.subjects = subjects;
    this.faculty = faculty;
    this.classrooms = classrooms;
    this.timeSlots = timeSlots;
    this.facultyAvailabilityMap = facultyAvailabilityMap;
    this.subjectRequirementsMap = subjectRequirementsMap;
    this.roomAvailability = roomAvailability;
    this.divisionSubjects = divisionSubjects;
  }

  getSubject(subjectId) {
    return this.subjects.find((subject) => subject.id === subjectId);
  }

  getSubjectRequirement(subjectId, division) {
    const requirement = this.getRequirementRecord(subjectId, division.id);
    const subject = this.getSubject(subjectId);

    return {
      roomType: requirement?.requiredRoomType || requirement?.roomType || subject?.roomType || 'CLASSROOM',
      requiredSeats: Number(requirement?.requiredSeats || subject?.capacity || division.studentCount || 0),
    };
  }

  getRequirementRecord(subjectId, divisionId) {
    if (Array.isArray(this.subjectRequirementsMap)) {
      return this.subjectRequirementsMap.find(
        (requirement) => requirement.subjectId === subjectId && (!requirement.divisionId || requirement.divisionId === divisionId),
      );
    }

    return this.subjectRequirementsMap[`${subjectId}:${divisionId}`]
      || this.subjectRequirementsMap[subjectId];
  }

  getDivisionSubjects(division) {
    const assignments = this.divisionSubjects?.[division.id];
    if (assignments) return assignments;

    // Compatibility for existing callers while they migrate to divisionSubjects.
    return this.subjects
      .filter((subject) => subject.departmentId === division.departmentId)
      .map((subject) => ({ subjectId: subject.id }));
  }

  getRequiredSessions(division, assignment) {
    const subject = this.getSubject(assignment.subjectId);
    const requirement = this.getRequirementRecord(assignment.subjectId, division.id);
    return Number(assignment.requiredSessions || requirement?.requiredSessions || subject?.requiredSessions || 1);
  }

  hasFacultyAvailability(facultyId, timeSlotId) {
    return this.facultyAvailabilityMap[facultyId]?.[timeSlotId] !== false;
  }

  hasRoomAvailability(roomId, timeSlotId) {
    return this.roomAvailability[roomId]?.[timeSlotId] !== false;
  }

  isRoomEligible(room, division, subject) {
    const requirement = this.getSubjectRequirement(subject.id, division);
    return room.roomType === requirement.roomType
      && Number(room.capacity) >= Math.max(Number(division.studentCount), requirement.requiredSeats);
  }

  sortTimeSlots() {
    return [...this.timeSlots].sort((a, b) => (
      (dayOrder.get(a.day) || 99) - (dayOrder.get(b.day) || 99)
      || a.period - b.period
    ));
  }

  buildTasks() {
    const tasks = [];

    for (const division of this.divisions) {
      for (const assignment of this.getDivisionSubjects(division)) {
        const subject = this.getSubject(assignment.subjectId);
        if (!subject) continue;

        const requiredSessions = this.getRequiredSessions(division, assignment);
        for (let sessionIndex = 0; sessionIndex < requiredSessions; sessionIndex += 1) {
          tasks.push({ division, subject, requiredSessions, sessionIndex });
        }
      }
    }

    return tasks;
  }

  createState() {
    return {
      entries: [],
      bestEntries: [],
      divisionSlots: new Set(),
      facultySlots: new Set(),
      roomSlots: new Set(),
      subjectDays: new Map(),
      divisionPeriods: new Map(),
      facultyPeriods: new Map(),
    };
  }

  key(resourceId, slotId) {
    return `${resourceId}:${slotId}`;
  }

  getFacultyCandidates(task, slot, state) {
    return this.faculty.filter((member) => (
      member.qualifications?.includes(task.subject.id)
      && this.hasFacultyAvailability(member.id, slot.id)
      && !state.facultySlots.has(this.key(member.id, slot.id))
    ));
  }

  getRoomCandidates(task, slot, state) {
    return this.classrooms.filter((room) => (
      this.isRoomEligible(room, task.division, task.subject)
      && this.hasRoomAvailability(room.id, slot.id)
      && !state.roomSlots.has(this.key(room.id, slot.id))
    ));
  }

  getStaticCandidateCount(task, slots) {
    let count = 0;
    for (const slot of slots) {
      const facultyAvailable = this.faculty.some((member) => (
        member.qualifications?.includes(task.subject.id) && this.hasFacultyAvailability(member.id, slot.id)
      ));
      const roomAvailable = this.classrooms.some((room) => (
        this.isRoomEligible(room, task.division, task.subject) && this.hasRoomAvailability(room.id, slot.id)
      ));
      if (facultyAvailable && roomAvailable) count += 1;
    }
    return count;
  }

  scoreCandidate(task, slot, faculty, room, state) {
    let score = 0;
    const subjectDays = state.subjectDays.get(`${task.division.id}:${task.subject.id}`) || new Set();
    const divisionPeriods = state.divisionPeriods.get(task.division.id) || new Set();
    const facultyPeriods = state.facultyPeriods.get(faculty.id) || new Set();

    // Soft constraints only affect ordering; hard checks happen before scoring.
    score += subjectDays.has(slot.day) ? -12 : 10;
    score += divisionPeriods.has(slot.period) ? -4 : 2;
    score += facultyPeriods.has(slot.period) ? -5 : 3;
    score -= Math.max(0, room.capacity - Math.max(task.division.studentCount, this.getSubjectRequirement(task.subject.id, task.division).requiredSeats)) * 0.05;
    if (slot.period === 1 || slot.period === 5) score -= 2;

    const futureFacultySlots = this.timeSlots.filter((candidateSlot) => (
      this.hasFacultyAvailability(faculty.id, candidateSlot.id)
      && !state.facultySlots.has(this.key(faculty.id, candidateSlot.id))
    )).length;
    score += Math.min(futureFacultySlots, 10) * 0.1;

    return score;
  }

  getCandidates(task, slots, state) {
    const candidates = [];
    const reasons = new Map();

    for (const slot of slots) {
      if (state.divisionSlots.has(this.key(task.division.id, slot.id))) {
        this.addReason(reasons, 'DIVISION_OCCUPIED', slot.id, `Division ${task.division.name} is already occupied.`);
        continue;
      }

      const facultyCandidates = this.getFacultyCandidates(task, slot, state);
      const roomCandidates = this.getRoomCandidates(task, slot, state);

      if (facultyCandidates.length === 0) {
        const qualified = this.faculty.filter((member) => member.qualifications?.includes(task.subject.id));
        if (qualified.length === 0) this.addReason(reasons, 'NO_QUALIFIED_FACULTY', slot.id, `No faculty member is qualified to teach ${task.subject.name}.`);
        else if (!qualified.some((member) => this.hasFacultyAvailability(member.id, slot.id))) this.addReason(reasons, 'FACULTY_UNAVAILABLE', slot.id, `Qualified faculty is unavailable for ${task.subject.name}.`);
        else this.addReason(reasons, 'FACULTY_OCCUPIED', slot.id, `All qualified faculty are teaching another division.`);
      }

      if (roomCandidates.length === 0) {
        const eligibleRooms = this.classrooms.filter((room) => this.isRoomEligible(room, task.division, task.subject));
        if (eligibleRooms.length === 0) {
          const requirement = this.getSubjectRequirement(task.subject.id, task.division);
          const typeMatches = this.classrooms.some((room) => room.roomType === requirement.roomType);
          this.addReason(reasons, typeMatches ? 'ROOM_CAPACITY' : 'ROOM_TYPE_MISMATCH', slot.id, typeMatches ? `No ${requirement.roomType} has enough capacity.` : `No ${requirement.roomType} is available.`);
        } else if (!eligibleRooms.some((room) => this.hasRoomAvailability(room.id, slot.id))) {
          this.addReason(reasons, 'ROOM_UNAVAILABLE', slot.id, `No suitable classroom is available.`);
        } else {
          this.addReason(reasons, 'ROOM_OCCUPIED', slot.id, `All suitable classrooms are occupied.`);
        }
      }

      for (const faculty of facultyCandidates) {
        for (const room of roomCandidates) {
          candidates.push({
            slot,
            faculty,
            room,
            score: this.scoreCandidate(task, slot, faculty, room, state),
          });
        }
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    return { candidates, reasons: this.formatReasons(reasons) };
  }

  addReason(reasons, type, timeSlotId, message) {
    const key = `${type}:${timeSlotId}`;
    if (!reasons.has(key)) reasons.set(key, { type, timeSlotId, message });
  }

  formatReasons(reasons) {
    const grouped = new Map();
    for (const reason of reasons.values()) {
      const existing = grouped.get(reason.type) || { type: reason.type, timeSlotIds: [], message: reason.message };
      existing.timeSlotIds.push(reason.timeSlotId);
      grouped.set(reason.type, existing);
    }
    return [...grouped.values()];
  }

  applyCandidate(task, candidate, state) {
    const entry = {
      id: `entry-${task.division.id}-${task.subject.id}-${candidate.slot.id}-${task.sessionIndex}`,
      divisionId: task.division.id,
      subjectId: task.subject.id,
      facultyId: candidate.faculty.id,
      roomId: candidate.room.id,
      timeSlotId: candidate.slot.id,
      status: 'draft',
    };
    state.entries.push(entry);
    state.divisionSlots.add(this.key(task.division.id, candidate.slot.id));
    state.facultySlots.add(this.key(candidate.faculty.id, candidate.slot.id));
    state.roomSlots.add(this.key(candidate.room.id, candidate.slot.id));

    const subjectKey = `${task.division.id}:${task.subject.id}`;
    const subjectDays = state.subjectDays.get(subjectKey) || new Set();
    subjectDays.add(candidate.slot.day);
    state.subjectDays.set(subjectKey, subjectDays);
    this.addPeriod(state.divisionPeriods, task.division.id, candidate.slot.period);
    this.addPeriod(state.facultyPeriods, candidate.faculty.id, candidate.slot.period);
    if (state.entries.length > state.bestEntries.length) state.bestEntries = state.entries.map((entry) => ({ ...entry }));
  }

  addPeriod(map, resourceId, period) {
    const periods = map.get(resourceId) || new Set();
    periods.add(period);
    map.set(resourceId, periods);
  }

  removeCandidate(task, candidate, state) {
    state.entries.pop();
    state.divisionSlots.delete(this.key(task.division.id, candidate.slot.id));
    state.facultySlots.delete(this.key(candidate.faculty.id, candidate.slot.id));
    state.roomSlots.delete(this.key(candidate.room.id, candidate.slot.id));

    const subjectKey = `${task.division.id}:${task.subject.id}`;
    const subjectDays = state.subjectDays.get(subjectKey);
    if (subjectDays) {
      const stillUsesDay = state.entries.some((entry) => entry.divisionId === task.division.id && entry.subjectId === task.subject.id && this.timeSlots.find((slot) => slot.id === entry.timeSlotId)?.day === candidate.slot.day);
      if (!stillUsesDay) subjectDays.delete(candidate.slot.day);
      if (subjectDays.size === 0) state.subjectDays.delete(subjectKey);
    }
    state.divisionPeriods = new Map();
    state.facultyPeriods = new Map();
    for (const existingEntry of state.entries) {
      const existingSlot = this.timeSlots.find((slot) => slot.id === existingEntry.timeSlotId);
      if (!existingSlot) continue;
      this.addPeriod(state.divisionPeriods, existingEntry.divisionId, existingSlot.period);
      this.addPeriod(state.facultyPeriods, existingEntry.facultyId, existingSlot.period);
    }
  }

  backtrack(tasks, index, slots, state, failureReasons) {
    if (index === tasks.length) return true;

    const task = tasks[index];
    const { candidates, reasons } = this.getCandidates(task, slots, state);
    if (candidates.length === 0) {
      failureReasons.set(`${task.division.id}:${task.subject.id}`, {
        divisionId: task.division.id,
        subjectId: task.subject.id,
        requiredSessions: task.requiredSessions,
        sessionIndex: task.sessionIndex,
        reasons,
      });
      return false;
    }

    for (const candidate of candidates) {
      this.applyCandidate(task, candidate, state);
      if (this.backtrack(tasks, index + 1, slots, state, failureReasons)) return true;
      this.removeCandidate(task, candidate, state);
    }

    failureReasons.set(`${task.division.id}:${task.subject.id}`, {
      divisionId: task.division.id,
      subjectId: task.subject.id,
      requiredSessions: task.requiredSessions,
      sessionIndex: task.sessionIndex,
      reasons,
    });
    return false;
  }

  generate() {
    const slots = this.sortTimeSlots();
    const state = this.createState();
    const failureReasons = new Map();
    const tasks = this.buildTasks().sort((a, b) => {
      const countDifference = this.getStaticCandidateCount(a, slots) - this.getStaticCandidateCount(b, slots);
      return countDifference || b.requiredSessions - a.requiredSessions;
    });

    const complete = this.backtrack(tasks, 0, slots, state, failureReasons);
    if (complete) {
      return { valid: true, status: 'VALID', entries: state.entries, conflicts: [] };
    }

    const conflicts = [...failureReasons.values()].map((failure) => ({
      type: 'NO_VALID_SCHEDULE',
      severity: 'HIGH',
      divisionId: failure.divisionId,
      subjectId: failure.subjectId,
      requiredSessions: failure.requiredSessions,
      scheduledSessions: 0,
      reasons: failure.reasons,
      message: `Unable to schedule ${failure.requiredSessions} sessions for ${this.getSubject(failure.subjectId)?.name || failure.subjectId}.`,
    }));

    const scheduledCounts = state.bestEntries.reduce((counts, entry) => {
      const key = `${entry.divisionId}:${entry.subjectId}`;
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});
    const incompleteConflicts = conflicts.map((conflict) => ({
      ...conflict,
      scheduledSessions: scheduledCounts[`${conflict.divisionId}:${conflict.subjectId}`] || 0,
    }));

    return { valid: false, status: 'INCOMPLETE', entries: state.bestEntries, conflicts: incompleteConflicts };
  }
}
