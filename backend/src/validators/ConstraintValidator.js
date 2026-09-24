export class ConstraintValidator {
  constructor({ facultyAvailabilityMap = {}, roomSchedule = {}, divisionSchedule = {} } = {}) {
    this.facultyAvailabilityMap = facultyAvailabilityMap;
    this.roomSchedule = roomSchedule;
    this.divisionSchedule = divisionSchedule;
  }

  checkFacultyAvailability(facultyId, timeSlotId) {
    const availability = this.facultyAvailabilityMap[facultyId]?.[timeSlotId];
    return availability !== false;
  }

  checkDivisionConflict(divisionId, timeSlotId, entries = []) {
    const existing = entries.filter((entry) => entry.divisionId === divisionId && entry.timeSlotId === timeSlotId);
    return existing.length === 0;
  }

  checkFacultyConflict(facultyId, timeSlotId, entries = []) {
    const existing = entries.filter((entry) => entry.facultyId === facultyId && entry.timeSlotId === timeSlotId);
    return existing.length === 0;
  }

  checkRoomConflict(roomId, timeSlotId, entries = []) {
    const existing = entries.filter((entry) => entry.roomId === roomId && entry.timeSlotId === timeSlotId);
    return existing.length === 0;
  }

  checkCapacity(roomCapacity, divisionSize) {
    return Number(roomCapacity) >= Number(divisionSize);
  }

  checkRoomType(roomType, requiredRoomType) {
    return roomType === requiredRoomType || requiredRoomType === null || requiredRoomType === undefined;
  }
}
