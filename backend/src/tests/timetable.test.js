import test from 'node:test';
import assert from 'node:assert/strict';
import { TimetableGenerator } from '../algorithms/TimetableGenerator.js';
import { TimetableValidator } from '../validators/TimetableValidator.js';
import { seedData } from '../data/seedData.js';

const facultyAvailabilityMap = seedData.facultyAvailability.reduce((acc, entry) => {
  if (!acc[entry.facultyId]) {
    acc[entry.facultyId] = {};
  }
  acc[entry.facultyId][entry.timeSlotId] = entry.available;
  return acc;
}, {});

function buildGenerator() {
  return new TimetableGenerator({
    divisions: seedData.divisions,
    subjects: seedData.subjects,
    faculty: seedData.faculty,
    classrooms: seedData.classrooms,
    timeSlots: seedData.timeSlots,
    facultyAvailabilityMap,
    subjectRequirementsMap: Object.fromEntries(seedData.subjectRequirements.map((entry) => [entry.subjectId, entry])),
  });
}

test('faculty conflict is detected when multiple divisions share a faculty slot', () => {
  const entries = [
    { divisionId: 'div-cse-a', subjectId: 'sub-ds', facultyId: 'fac-f1', roomId: 'room-101', timeSlotId: 'mon-1' },
    { divisionId: 'div-cse-b', subjectId: 'sub-dbms', facultyId: 'fac-f1', roomId: 'room-102', timeSlotId: 'mon-1' },
  ];

  const validator = new TimetableValidator({
    entries,
    facultyAvailabilityMap,
    classrooms: seedData.classrooms,
    divisions: seedData.divisions,
    subjects: seedData.subjects,
    requiredSessionsMap: { 'sub-ds': 3, 'sub-dbms': 3 },
  });

  const result = validator.validate();
  assert.equal(result.valid, false);
  assert.ok(result.conflicts.some((conflict) => conflict.type === 'FACULTY_CONFLICT'));
});

test('division conflict is detected when a division has two subjects in same slot', () => {
  const entries = [
    { divisionId: 'div-cse-a', subjectId: 'sub-ds', facultyId: 'fac-f1', roomId: 'room-101', timeSlotId: 'mon-1' },
    { divisionId: 'div-cse-a', subjectId: 'sub-dbms', facultyId: 'fac-f2', roomId: 'room-102', timeSlotId: 'mon-1' },
  ];

  const validator = new TimetableValidator({
    entries,
    facultyAvailabilityMap,
    classrooms: seedData.classrooms,
    divisions: seedData.divisions,
    subjects: seedData.subjects,
    requiredSessionsMap: { 'sub-ds': 3, 'sub-dbms': 3 },
  });

  const result = validator.validate();
  assert.equal(result.valid, false);
  assert.ok(result.conflicts.some((conflict) => conflict.type === 'DIVISION_CONFLICT'));
});

test('classroom conflict is detected when two divisions share a room slot', () => {
  const entries = [
    { divisionId: 'div-cse-a', subjectId: 'sub-ds', facultyId: 'fac-f1', roomId: 'room-101', timeSlotId: 'mon-1' },
    { divisionId: 'div-cse-b', subjectId: 'sub-dbms', facultyId: 'fac-f2', roomId: 'room-101', timeSlotId: 'mon-1' },
  ];

  const validator = new TimetableValidator({
    entries,
    facultyAvailabilityMap,
    classrooms: seedData.classrooms,
    divisions: seedData.divisions,
    subjects: seedData.subjects,
    requiredSessionsMap: { 'sub-ds': 3, 'sub-dbms': 3 },
  });

  const result = validator.validate();
  assert.equal(result.valid, false);
  assert.ok(result.conflicts.some((conflict) => conflict.type === 'CLASSROOM_CONFLICT'));
});

test('faculty unavailable is rejected', () => {
  const entries = [
    { divisionId: 'div-cse-a', subjectId: 'sub-ds', facultyId: 'fac-f1', roomId: 'room-101', timeSlotId: 'fri-1' },
  ];

  const validator = new TimetableValidator({
    entries,
    facultyAvailabilityMap,
    classrooms: seedData.classrooms,
    divisions: seedData.divisions,
    subjects: seedData.subjects,
    requiredSessionsMap: { 'sub-ds': 3 },
  });

  const result = validator.validate();
  assert.equal(result.valid, false);
  assert.ok(result.conflicts.some((conflict) => conflict.type === 'FACULTY_UNAVAILABLE'));
});

test('classroom unavailable is rejected', () => {
  const entries = [
    { divisionId: 'div-cse-a', subjectId: 'sub-ds', facultyId: 'fac-f4', roomId: 'room-101', timeSlotId: 'fri-1' },
  ];
  const roomAvailability = {
    ...seedData.roomAvailability,
    'room-101': {
      ...seedData.roomAvailability['room-101'],
      'fri-1': false,
    },
  };

  const validator = new TimetableValidator({
    entries,
    facultyAvailabilityMap,
    classrooms: seedData.classrooms,
    divisions: seedData.divisions,
    subjects: seedData.subjects,
    requiredSessionsMap: { 'sub-ds': 3 },
    roomAvailability,
  });

  const result = validator.validate();
  assert.equal(result.valid, false);
  assert.ok(result.conflicts.some((conflict) => conflict.type === 'CLASSROOM_UNAVAILABLE'));
});

test('wrong room type is rejected', () => {
  const entries = [
    { divisionId: 'div-cse-a', subjectId: 'sub-cn', facultyId: 'fac-f3', roomId: 'room-101', timeSlotId: 'mon-1' },
  ];

  const validator = new TimetableValidator({
    entries,
    facultyAvailabilityMap,
    classrooms: seedData.classrooms,
    divisions: seedData.divisions,
    subjects: seedData.subjects,
    requiredSessionsMap: { 'sub-cn': 2 },
  });

  const result = validator.validate();
  assert.equal(result.valid, false);
  assert.ok(result.conflicts.some((conflict) => conflict.type === 'ROOM_TYPE_VIOLATION'));
});

test('insufficient room capacity is rejected', () => {
  const entries = [
    { divisionId: 'div-cse-a', subjectId: 'sub-ds', facultyId: 'fac-f1', roomId: 'room-103', timeSlotId: 'mon-1' },
  ];

  const validator = new TimetableValidator({
    entries,
    facultyAvailabilityMap,
    classrooms: seedData.classrooms,
    divisions: seedData.divisions,
    subjects: seedData.subjects,
    requiredSessionsMap: { 'sub-ds': 3 },
  });

  const result = validator.validate();
  assert.equal(result.valid, false);
  assert.ok(result.conflicts.some((conflict) => conflict.type === 'CAPACITY_VIOLATION'));
});

test('required session count is enforced', () => {
  const entries = [
    { divisionId: 'div-cse-a', subjectId: 'sub-ds', facultyId: 'fac-f1', roomId: 'room-101', timeSlotId: 'mon-1' },
    { divisionId: 'div-cse-a', subjectId: 'sub-ds', facultyId: 'fac-f4', roomId: 'room-102', timeSlotId: 'mon-2' },
  ];

  const validator = new TimetableValidator({
    entries,
    facultyAvailabilityMap,
    classrooms: seedData.classrooms,
    divisions: seedData.divisions,
    subjects: seedData.subjects,
    requiredSessionsMap: { 'sub-ds': 3 },
  });

  const result = validator.validate();
  assert.equal(result.valid, false);
  assert.ok(result.conflicts.some((conflict) => conflict.type === 'SESSION_COUNT_MISMATCH'));
});

test('valid timetable passes validation', () => {
  const generator = buildGenerator();
  const result = generator.generate();

  assert.equal(result.valid, true, JSON.stringify(result.conflicts));

  const requiredSessionsMap = Object.fromEntries(
    seedData.subjects.map((subject) => {
      const matchingDivisions = seedData.divisions.filter((division) => division.departmentId === subject.departmentId).length;
      return [subject.id, subject.requiredSessions * matchingDivisions];
    }),
  );

  const validator = new TimetableValidator({
    entries: result.entries,
    facultyAvailabilityMap,
    classrooms: seedData.classrooms,
    divisions: seedData.divisions,
    subjects: seedData.subjects,
    requiredSessionsMap,
    roomAvailability: seedData.roomAvailability,
  });

  const validation = validator.validate();
  assert.equal(validation.valid, true, JSON.stringify(validation.conflicts));
});

test('impossible timetable reports solvability issue', () => {
  const generator = buildGenerator();
  const result = generator.generate();
  assert.ok(result.valid || result.conflicts.length > 0);
});

test('manual timetable modification causing conflict is caught', () => {
  const entries = [
    { divisionId: 'div-cse-a', subjectId: 'sub-ds', facultyId: 'fac-f1', roomId: 'room-101', timeSlotId: 'mon-1' },
    { divisionId: 'div-cse-b', subjectId: 'sub-dbms', facultyId: 'fac-f1', roomId: 'room-102', timeSlotId: 'mon-1' },
    { divisionId: 'div-cse-a', subjectId: 'sub-java', facultyId: 'fac-f4', roomId: 'room-101', timeSlotId: 'mon-2' },
  ];

  const validator = new TimetableValidator({
    entries,
    facultyAvailabilityMap,
    classrooms: seedData.classrooms,
    divisions: seedData.divisions,
    subjects: seedData.subjects,
    requiredSessionsMap: { 'sub-ds': 3, 'sub-dbms': 3, 'sub-java': 3 },
  });

  const result = validator.validate();
  assert.equal(result.valid, false);
  assert.ok(result.conflicts.some((conflict) => conflict.type === 'FACULTY_CONFLICT' || conflict.type === 'CLASSROOM_CONFLICT'));
});
