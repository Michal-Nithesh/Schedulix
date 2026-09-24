export class TimetableGenerator {
  constructor({ divisions, subjects, faculty, classrooms, timeSlots, facultyAvailabilityMap, subjectRequirementsMap = {}, roomAvailability = {} }) {
    this.divisions = divisions;
    this.subjects = subjects;
    this.faculty = faculty;
    this.classrooms = classrooms;
    this.timeSlots = timeSlots;
    this.facultyAvailabilityMap = facultyAvailabilityMap;
    this.subjectRequirementsMap = subjectRequirementsMap;
    this.roomAvailability = roomAvailability;
  }

  getSubjectRequirement(subjectId, division) {
    const requirement = this.subjectRequirementsMap[subjectId];
    if (requirement) {
      return {
        roomType: requirement.requiredRoomType || requirement.roomType || 'CLASSROOM',
        requiredSeats: Number(requirement.requiredSeats || division.studentCount || 0),
      };
    }

    const subject = this.subjects.find((item) => item.id === subjectId);
    return {
      roomType: subject?.roomType || 'CLASSROOM',
      requiredSeats: Number(subject?.capacity || division.studentCount || 0),
    };
  }

  isRoomEligible(room, division, subject) {
    const requirement = this.getSubjectRequirement(subject.id, division);
    if (room.roomType !== requirement.roomType) {
      return false;
    }
    if (room.capacity < Math.max(division.studentCount, requirement.requiredSeats)) {
      return false;
    }
    return true;
  }

  hasRoomAvailability(roomId, slotId) {
    const roomAvailability = this.roomAvailability || {};
    return roomAvailability[roomId]?.[slotId] !== false;
  }

  generate() {
    const generated = [];
    const conflicts = [];
    const timeSlots = [...this.timeSlots].sort((a, b) => (a.day > b.day ? 1 : -1) || a.period - b.period);

    const processDivision = (division) => {
      const divisionSubjects = [...this.subjects]
        .filter((subject) => subject.departmentId === division.departmentId)
        .sort((a, b) => Number(b.requiredSessions || 0) - Number(a.requiredSessions || 0));

      for (const subject of divisionSubjects) {
        const requiredSessions = Number(subject.requiredSessions || 1);
        let scheduled = 0;

        while (scheduled < requiredSessions) {
          let bestOption = null;

          for (const slot of timeSlots) {
            const divisionTaken = generated.some(
              (entry) => entry.divisionId === division.id && entry.timeSlotId === slot.id,
            );
            if (divisionTaken) continue;

            const facultyCandidates = this.faculty.filter((member) => {
              if (!member.qualifications.includes(subject.id)) return false;
              if (this.facultyAvailabilityMap[member.id]?.[slot.id] === false) return false;
              const facultyTaken = generated.some(
                (entry) => entry.facultyId === member.id && entry.timeSlotId === slot.id,
              );
              return !facultyTaken;
            });

            const roomCandidates = this.classrooms.filter((room) => {
              if (!this.isRoomEligible(room, division, subject)) return false;
              if (this.hasRoomAvailability(room.id, slot.id) === false) return false;
              const roomTaken = generated.some((entry) => entry.roomId === room.id && entry.timeSlotId === slot.id);
              return !roomTaken;
            });

            if (facultyCandidates.length === 0 || roomCandidates.length === 0) continue;

            const score = facultyCandidates.length * roomCandidates.length;
            const candidate = {
              slot,
              faculty: facultyCandidates[0],
              room: roomCandidates[0],
              score,
            };

            if (!bestOption || candidate.score < bestOption.score) {
              bestOption = candidate;
            }
          }

          if (!bestOption) {
            conflicts.push({
              divisionId: division.id,
              subjectId: subject.id,
              requiredSessions,
              scheduled,
              reason: `Unable to schedule ${requiredSessions} sessions for ${subject.name}.`,
            });
            break;
          }

          generated.push({
            id: `entry-${division.id}-${subject.id}-${bestOption.slot.id}`,
            divisionId: division.id,
            subjectId: subject.id,
            facultyId: bestOption.faculty.id,
            roomId: bestOption.room.id,
            timeSlotId: bestOption.slot.id,
            status: 'draft',
          });

          scheduled += 1;
        }
      }
    };

    for (const division of this.divisions) {
      processDivision(division);
    }

    return {
      valid: conflicts.length === 0,
      entries: generated,
      conflicts,
    };
  }
}
