import test from 'node:test';
import assert from 'node:assert/strict';
import { TimetableGenerator } from '../algorithms/TimetableGenerator.js';
import { TimetableValidator } from '../validators/TimetableValidator.js';
import { seedData } from '../data/seedData.js';

const facultyAvailabilityMap = seedData.facultyAvailability.reduce((map, entry) => {
  map[entry.facultyId] ??= {};
  map[entry.facultyId][entry.timeSlotId] = entry.available;
  return map;
}, {});

function createGenerator(overrides = {}) {
  return new TimetableGenerator({
    divisions: seedData.divisions,
    subjects: seedData.subjects,
    faculty: seedData.faculty,
    classrooms: seedData.classrooms,
    timeSlots: seedData.timeSlots,
    facultyAvailabilityMap,
    subjectRequirementsMap: seedData.subjectRequirements,
    roomAvailability: seedData.roomAvailability,
    divisionSubjects: seedData.divisionSubjects,
    ...overrides,
  });
}

function createValidator(entries, overrides = {}) {
  return new TimetableValidator({
    entries,
    facultyAvailabilityMap,
    classrooms: seedData.classrooms,
    divisions: seedData.divisions,
    subjects: seedData.subjects,
    faculty: seedData.faculty,
    timeSlots: seedData.timeSlots,
    subjectRequirementsMap: seedData.subjectRequirements,
    divisionSubjects: seedData.divisionSubjects,
    roomAvailability: seedData.roomAvailability,
    ...overrides,
  });
}

const entry = (overrides = {}) => ({
  id: `entry-${Math.random()}`,
  divisionId: 'div-cse-a',
  subjectId: 'sub-ds',
  facultyId: 'fac-f1',
  roomId: 'room-101',
  timeSlotId: 'mon-1',
  ...overrides,
});

test('generates a valid timetable for explicit division assignments', () => {
  const result = createGenerator().generate();
  assert.equal(result.valid, true, JSON.stringify(result.conflicts));
  assert.equal(result.status, 'VALID');

  const validation = createValidator(result.entries).validate();
  assert.equal(validation.valid, true, JSON.stringify(validation.conflicts));
});

test('does not schedule department subjects not assigned to a division', () => {
  const result = createGenerator({
    divisions: [{ id: 'd1', name: 'D1', departmentId: 'dept-cse', studentCount: 10 }],
    divisionSubjects: { d1: [{ subjectId: 'sub-ds', requiredSessions: 1 }] },
    subjects: seedData.subjects,
    timeSlots: seedData.timeSlots.slice(0, 3),
  }).generate();

  assert.equal(result.valid, true);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].subjectId, 'sub-ds');
});

test('detects faculty conflict', () => {
  const result = createValidator([
    entry({ id: 'e1', facultyId: 'fac-f1', roomId: 'room-101', timeSlotId: 'mon-1' }),
    entry({ id: 'e2', divisionId: 'div-cse-b', subjectId: 'sub-java', facultyId: 'fac-f1', roomId: 'room-102', timeSlotId: 'mon-1' }),
  ]).validate();
  assert.ok(result.conflicts.some((conflict) => conflict.type === 'FACULTY_CONFLICT'));
});

test('detects classroom conflict', () => {
  const result = createValidator([
    entry({ id: 'e1', roomId: 'room-101' }),
    entry({ id: 'e2', divisionId: 'div-cse-b', subjectId: 'sub-java', facultyId: 'fac-f3', roomId: 'room-101', timeSlotId: 'mon-1' }),
  ]).validate();
  assert.ok(result.conflicts.some((conflict) => conflict.type === 'ROOM_CONFLICT'));
});

test('detects division conflict', () => {
  const result = createValidator([
    entry({ id: 'e1', subjectId: 'sub-ds', facultyId: 'fac-f1' }),
    entry({ id: 'e2', subjectId: 'sub-java', facultyId: 'fac-f3', roomId: 'room-102' }),
  ]).validate();
  assert.ok(result.conflicts.some((conflict) => conflict.type === 'DIVISION_CONFLICT'));
});

test('detects unavailable faculty and invalid qualification', () => {
  const result = createValidator([entry({ timeSlotId: 'fri-1', facultyId: 'fac-f1' })]).validate();
  assert.ok(result.conflicts.some((conflict) => conflict.type === 'FACULTY_UNAVAILABLE'));
  const unqualified = createValidator([entry({ facultyId: 'fac-f2', timeSlotId: 'mon-1' })]).validate();
  assert.ok(unqualified.conflicts.some((conflict) => conflict.type === 'FACULTY_NOT_QUALIFIED'));
});

test('detects classroom availability, type, and capacity violations', () => {
  const unavailable = createValidator([entry({ timeSlotId: 'fri-1' })], {
    roomAvailability: {
      ...seedData.roomAvailability,
      'room-101': { ...seedData.roomAvailability['room-101'], 'fri-1': false },
    },
  }).validate();
  assert.ok(unavailable.conflicts.some((conflict) => conflict.type === 'ROOM_UNAVAILABLE'));

  const wrongType = createValidator([entry({ subjectId: 'sub-cn', roomId: 'room-101' })]).validate();
  assert.ok(wrongType.conflicts.some((conflict) => conflict.type === 'ROOM_TYPE_MISMATCH'));

  const tooSmall = createValidator([entry({ roomId: 'room-103' })]).validate();
  assert.ok(tooSmall.conflicts.some((conflict) => conflict.type === 'ROOM_CAPACITY'));
});

test('detects required session count per division', () => {
  const result = createValidator([entry({ timeSlotId: 'mon-1' })]).validate();
  const conflict = result.conflicts.find((item) => item.type === 'SESSION_COUNT_MISMATCH');
  assert.ok(conflict);
  assert.equal(conflict.divisionId, 'div-cse-a');
  assert.equal(conflict.expectedCount, 3);
  assert.equal(conflict.actualCount, 1);
});

test('reports an impossible schedule with grouped reasons', () => {
  const result = createGenerator({
    divisions: [{ id: 'd1', name: 'D1', departmentId: 'dept-cse', studentCount: 100 }],
    divisionSubjects: { d1: [{ subjectId: 'sub-ds', requiredSessions: 1 }] },
    timeSlots: [{ id: 'only', day: 'Monday', period: 1 }],
  }).generate();

  assert.equal(result.valid, false);
  assert.equal(result.status, 'INCOMPLETE');
  assert.equal(result.entries.length, 0);
  assert.equal(result.conflicts[0].type, 'NO_VALID_SCHEDULE');
  assert.ok(result.conflicts[0].reasons.some((reason) => reason.type === 'ROOM_CAPACITY'));
});

test('preserves scheduled entries when later tasks make the timetable incomplete', () => {
  const result = createGenerator({
    divisions: [
      { id: 'd1', name: 'D1', departmentId: 'dept-cse', studentCount: 10 },
      { id: 'd2', name: 'D2', departmentId: 'dept-cse', studentCount: 10 },
    ],
    subjects: [
      { id: 'a', name: 'A', departmentId: 'dept-cse', requiredSessions: 1, roomType: 'CLASSROOM', capacity: 10 },
      { id: 'b', name: 'B', departmentId: 'dept-cse', requiredSessions: 1, roomType: 'CLASSROOM', capacity: 10 },
    ],
    faculty: [{ id: 'f1', name: 'Shared', qualifications: ['a', 'b'] }],
    classrooms: [{ id: 'r1', name: 'Room 1', roomType: 'CLASSROOM', capacity: 20 }],
    divisionSubjects: {
      d1: [{ subjectId: 'a', requiredSessions: 1 }],
      d2: [{ subjectId: 'b', requiredSessions: 1 }],
    },
    facultyAvailabilityMap: { f1: { only: true } },
    roomAvailability: { r1: { only: true } },
    timeSlots: [{ id: 'only', day: 'Monday', period: 1 }],
  }).generate();

  assert.equal(result.status, 'INCOMPLETE');
  assert.equal(result.entries.length, 1);
  assert.equal(result.conflicts[0].scheduledSessions, 0);
  assert.equal(result.conflicts[0].requiredSessions, 1);
});

test('backtracks after an earlier resource choice blocks a later task', () => {
  const divisions = [
    { id: 'd1', name: 'D1', departmentId: 'dept-cse', studentCount: 10 },
    { id: 'd2', name: 'D2', departmentId: 'dept-cse', studentCount: 10 },
  ];
  const subjects = [
    { id: 'a', name: 'A', departmentId: 'dept-cse', requiredSessions: 1, roomType: 'CLASSROOM', capacity: 10 },
    { id: 'b', name: 'B', departmentId: 'dept-cse', requiredSessions: 1, roomType: 'CLASSROOM', capacity: 20 },
  ];
  const faculty = [{ id: 'f1', name: 'Shared', qualifications: ['a', 'b'] }];
  const slots = [
    { id: 's1', day: 'Monday', period: 1 },
    { id: 's2', day: 'Tuesday', period: 2 },
  ];
  class TrackingGenerator extends TimetableGenerator {
    backtracks = 0;

    getStaticCandidateCount() {
      return 0;
    }

    getCandidates(...args) {
      const result = super.getCandidates(...args);
      result.candidates.sort((a, b) => (a.room.id === 'r1' ? -1 : b.room.id === 'r1' ? 1 : 0));
      return result;
    }

    removeCandidate(...args) {
      this.backtracks += 1;
      return super.removeCandidate(...args);
    }
  }

  const generator = new TrackingGenerator({
    divisions,
    subjects,
    faculty,
    classrooms: [
      { id: 'r1', roomType: 'CLASSROOM', capacity: 20 },
      { id: 'r2', roomType: 'CLASSROOM', capacity: 10 },
    ],
    timeSlots: slots,
    facultyAvailabilityMap: { f1: { s1: true, s2: true } },
    roomAvailability: { r1: { s1: false, s2: true }, r2: { s1: true, s2: true } },
    divisionSubjects: { d1: [{ subjectId: 'a' }], d2: [{ subjectId: 'b' }] },
  });
  const result = generator.generate();

  assert.equal(result.valid, true, JSON.stringify(result.conflicts));
  assert.ok(generator.backtracks > 0);
  assert.deepEqual(result.entries.map((item) => item.roomId).sort(), ['r1', 'r2']);
});

test('manual edits remain independently validatable', () => {
  const result = createValidator([
    entry({ id: 'e1', timeSlotId: 'mon-1' }),
    entry({ id: 'e2', divisionId: 'div-cse-b', subjectId: 'sub-java', facultyId: 'fac-f1', roomId: 'room-102', timeSlotId: 'mon-1' }),
  ]).validate();
  assert.equal(result.valid, false);
  assert.ok(result.conflicts.some((conflict) => conflict.type === 'FACULTY_CONFLICT'));
});
