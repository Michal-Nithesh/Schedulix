import express from 'express';
import { seedData } from '../data/seedData.js';
import { TimetableGenerator } from '../algorithms/TimetableGenerator.js';
import { TimetableValidator } from '../validators/TimetableValidator.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';

const router = express.Router();

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
    subjectRequirementsMap: seedData.subjectRequirements,
    roomAvailability: seedData.roomAvailability,
    divisionSubjects: seedData.divisionSubjects,
  });
}

router.get('/departments', (_req, res) => {
  res.json(successResponse(seedData.departments));
});

router.get('/divisions', (_req, res) => {
  res.json(successResponse(seedData.divisions));
});

router.get('/subjects', (_req, res) => {
  res.json(successResponse(seedData.subjects));
});

router.get('/faculty', (_req, res) => {
  res.json(successResponse(seedData.faculty));
});

router.get('/classrooms', (_req, res) => {
  res.json(successResponse(seedData.classrooms));
});

router.get('/time-slots', (_req, res) => {
  res.json(successResponse(seedData.timeSlots));
});

router.post('/timetable/generate', (_req, res) => {
  const result = buildGenerator().generate();

  if (!result.valid) {
    return res.status(400).json(errorResponse('Timetable generation failed due to hard constraint conflicts.', 'GENERATION_FAILED', result.conflicts));
  }

  res.json(successResponse({ entries: result.entries, summary: { generated: result.entries.length } }));
});

router.post('/timetable/validate', (req, res) => {
  const entries = Array.isArray(req.body.entries) ? req.body.entries : [];
  const validator = new TimetableValidator({
    entries,
    facultyAvailabilityMap,
    classrooms: seedData.classrooms,
    divisions: seedData.divisions,
    subjects: seedData.subjects,
    faculty: seedData.faculty,
    timeSlots: seedData.timeSlots,
    requiredSessionsMap: Object.fromEntries(seedData.subjects.map((subject) => [subject.id, subject.requiredSessions])),
    subjectRequirementsMap: seedData.subjectRequirements,
    divisionSubjects: seedData.divisionSubjects,
    roomAvailability: seedData.roomAvailability,
  });

  const result = validator.validate();
  res.json(successResponse(result));
});

router.get('/timetable/current', (_req, res) => {
  const generated = buildGenerator().generate();
  res.json(successResponse({ entries: generated.entries, status: generated.valid ? 'ready' : 'conflicts' }));
});

export default router;
