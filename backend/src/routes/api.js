import express from 'express';
import { seedData } from '../data/seedData.js';
import { isSupabaseConfigured, loadSchedulingData, createDraftVersion, getCurrentTimetable, getTimetableVersions, updateEntry, publishVersion, supabase } from '../data/supabase.js';
import { TimetableGenerator } from '../algorithms/TimetableGenerator.js';
import { TimetableValidator } from '../validators/TimetableValidator.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';
import { DEMO_USERS, PERMISSIONS, normalizeRole, requireAuth, requirePermission } from '../auth/rbac.js';

const router = express.Router();

const facultyAvailabilityMap = seedData.facultyAvailability.reduce((acc, entry) => {
  if (!acc[entry.facultyId]) {
    acc[entry.facultyId] = {};
  }
  acc[entry.facultyId][entry.timeSlotId] = entry.available;
  return acc;
}, {});

function buildGenerator(data = seedData) {
  return new TimetableGenerator({
    divisions: data.divisions,
    subjects: data.subjects,
    faculty: data.faculty,
    classrooms: data.classrooms,
    timeSlots: data.timeSlots,
    facultyAvailabilityMap: data.facultyAvailabilityMap || facultyAvailabilityMap,
    subjectRequirementsMap: data.subjectRequirements || seedData.subjectRequirements,
    roomAvailability: data.roomAvailability || seedData.roomAvailability,
    divisionSubjects: data.divisionSubjects || seedData.divisionSubjects,
  });
}

async function schedulingData() {
  return isSupabaseConfigured ? loadSchedulingData() : seedData;
}

router.get('/auth/me', requireAuth, (req, res) => {
  res.json(successResponse({ user: req.user }));
});

router.get('/departments', requireAuth, requirePermission(PERMISSIONS.VIEW_DATA), async (_req, res, next) => {
  try { res.json(successResponse((await schedulingData()).departments)); } catch (error) { next(error); }
});

router.post('/departments', requireAuth, requirePermission(PERMISSIONS.MANAGE_DEPARTMENTS), async (req, res, next) => {
  try {
    if (!isSupabaseConfigured) return res.status(503).json(errorResponse('Supabase is required to create departments.', 'SUPABASE_NOT_CONFIGURED'));

    const name = String(req.body?.name || '').trim();
    const code = String(req.body?.code || '').trim().toUpperCase();
    const id = code.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    if (!name || !code) return res.status(400).json(errorResponse('Department name and code are required.', 'VALIDATION_ERROR'));
    if (!id) return res.status(400).json(errorResponse('Department code must contain letters or numbers.', 'VALIDATION_ERROR'));

    const { data, error } = await supabase.from('departments').insert({ id, name, code }).select().single();
    if (error?.code === '23505') return res.status(409).json(errorResponse('A department with that code already exists.', 'DEPARTMENT_EXISTS'));
    if (error) throw error;
    res.status(201).json(successResponse(data));
  } catch (error) { next(error); }
});

router.get('/divisions', requireAuth, requirePermission(PERMISSIONS.VIEW_DATA), async (_req, res, next) => {
  try { res.json(successResponse((await schedulingData()).divisions)); } catch (error) { next(error); }
});

router.get('/subjects', requireAuth, requirePermission(PERMISSIONS.VIEW_DATA), async (_req, res, next) => {
  try { res.json(successResponse((await schedulingData()).subjects)); } catch (error) { next(error); }
});

router.get('/faculty', requireAuth, requirePermission(PERMISSIONS.VIEW_DATA), async (_req, res, next) => {
  try { res.json(successResponse((await schedulingData()).faculty)); } catch (error) { next(error); }
});

router.get('/classrooms', requireAuth, requirePermission(PERMISSIONS.VIEW_DATA), async (_req, res, next) => {
  try { res.json(successResponse((await schedulingData()).classrooms)); } catch (error) { next(error); }
});

router.get('/time-slots', requireAuth, requirePermission(PERMISSIONS.VIEW_DATA), async (_req, res, next) => {
  try { res.json(successResponse((await schedulingData()).timeSlots)); } catch (error) { next(error); }
});

router.get('/division-subjects', requireAuth, requirePermission(PERMISSIONS.VIEW_DATA), async (_req, res, next) => {
  try { res.json(successResponse((await schedulingData()).divisionSubjects || {})); } catch (error) { next(error); }
});

router.get('/subject-requirements', requireAuth, requirePermission(PERMISSIONS.VIEW_DATA), async (_req, res, next) => {
  try { res.json(successResponse((await schedulingData()).subjectRequirements || [])); } catch (error) { next(error); }
});

router.put('/division-subjects/:divisionId', requireAuth, requirePermission(PERMISSIONS.MANAGE_DIVISION_SUBJECTS), async (req, res, next) => {
  try {
    if (!isSupabaseConfigured) return res.status(503).json(errorResponse('Supabase is required for configuration changes.', 'SUPABASE_NOT_CONFIGURED'));
    const rows = (Array.isArray(req.body.subjectIds) ? req.body.subjectIds : []).map((subjectId) => ({ division_id: req.params.divisionId, subject_id: subjectId }));
    const { error: deleteError } = await supabase.from('division_subjects').delete().eq('division_id', req.params.divisionId);
    if (deleteError) throw deleteError;
    if (rows.length) { const { error } = await supabase.from('division_subjects').insert(rows); if (error) throw error; }
    res.json(successResponse({ divisionId: req.params.divisionId, subjectIds: rows.map((row) => row.subject_id) }));
  } catch (error) { next(error); }
});

router.put('/subject-requirements/:subjectId/:divisionId', requireAuth, requirePermission(PERMISSIONS.MANAGE_REQUIREMENTS), async (req, res, next) => {
  try {
    if (!isSupabaseConfigured) return res.status(503).json(errorResponse('Supabase is required for configuration changes.', 'SUPABASE_NOT_CONFIGURED'));
    const row = { subject_id: req.params.subjectId, division_id: req.params.divisionId, required_room_type: req.body.requiredRoomType, required_seats: Number(req.body.requiredSeats) };
    const { data, error } = await supabase.from('subject_requirements').upsert(row).select().single();
    if (error) throw error;
    res.json(successResponse(data));
  } catch (error) { next(error); }
});

router.get('/users', requireAuth, requirePermission(PERMISSIONS.MANAGE_USERS), (_req, res) => {
  res.json(successResponse(DEMO_USERS));
});

router.post('/users', requireAuth, requirePermission(PERMISSIONS.MANAGE_USERS), (req, res) => {
  const { name, email, role } = req.body || {};

  if (!name || !email) {
    return res.status(400).json(errorResponse('Name and email are required.', 'VALIDATION_ERROR'));
  }

  const normalizedRole = normalizeRole(role) || 'VIEWER';
  const exists = DEMO_USERS.some((user) => user.email.toLowerCase() === String(email).toLowerCase());

  if (exists) {
    return res.status(409).json(errorResponse('A user with that email already exists.', 'USER_EXISTS'));
  }

  const nextUser = {
    id: `user-${Date.now()}`,
    name: String(name),
    email: String(email),
    role: normalizedRole,
  };

  DEMO_USERS.push(nextUser);
  res.status(201).json(successResponse({ user: nextUser }));
});

router.get('/audit-logs', requireAuth, requirePermission(PERMISSIONS.VIEW_AUDIT_LOGS), (_req, res) => {
  res.json(successResponse([
    { id: 'audit-1', action: 'Timetable generated', resource: 'timetable', user: 'admin@schedulix.app', createdAt: new Date().toISOString() },
  ]));
});

router.get('/settings', requireAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), (_req, res) => {
  res.json(successResponse({
    appName: 'Schedulix',
    maintenanceMode: false,
    defaultRole: 'SCHEDULER',
  }));
});

router.post('/timetable/generate', requireAuth, requirePermission(PERMISSIONS.GENERATE_TIMETABLE), async (_req, res, next) => {
  try {
  const result = buildGenerator(await schedulingData()).generate();

  const required = result.entries.length + result.conflicts.reduce((total, conflict) => total + Math.max(0, (conflict.requiredSessions || 0) - (conflict.scheduledSessions || 0)), 0);
  res.json(successResponse({
    status: result.status,
    entries: result.entries,
    conflicts: result.conflicts,
    summary: { generated: result.entries.length, required, conflicts: result.conflicts.length },
  }));
  } catch (error) { next(error); }
});

router.post('/timetable/validate', requireAuth, requirePermission(PERMISSIONS.VALIDATE_TIMETABLE), async (req, res, next) => {
  try {
  const data = await schedulingData();
  const entries = Array.isArray(req.body.entries) ? req.body.entries : [];
  const validator = new TimetableValidator({
    entries,
    facultyAvailabilityMap: data.facultyAvailabilityMap || facultyAvailabilityMap,
    classrooms: data.classrooms,
    divisions: data.divisions,
    subjects: data.subjects,
    faculty: data.faculty,
    timeSlots: data.timeSlots,
    subjectRequirementsMap: data.subjectRequirements || seedData.subjectRequirements,
    divisionSubjects: data.divisionSubjects || seedData.divisionSubjects,
    roomAvailability: data.roomAvailability || seedData.roomAvailability,
  });

  const result = validator.validate();
  res.json(successResponse(result));
  } catch (error) { next(error); }
});

router.post('/timetable/drafts', requireAuth, requirePermission(PERMISSIONS.EDIT_TIMETABLE), async (req, res, next) => {
  try {
    const entries = Array.isArray(req.body.entries) ? req.body.entries : [];
    const data = await schedulingData();
    const result = new TimetableValidator({ ...data, entries, subjectRequirementsMap: data.subjectRequirements, divisionSubjects: data.divisionSubjects }).validate();
    if (!result.valid) return res.status(400).json(errorResponse('Draft contains conflicts and was not saved.', 'VALIDATION_FAILED', result.conflicts));
    res.status(201).json(successResponse(await createDraftVersion(entries, req.user.id, req.body.name)));
  } catch (error) { next(error); }
});

router.patch('/timetable/entries/:versionId/:entryId', requireAuth, requirePermission(PERMISSIONS.EDIT_TIMETABLE), async (req, res, next) => {
  try {
    const current = await getCurrentTimetable();
    const updatedEntry = current.entries.find((entry) => entry.id === req.params.entryId);
    if (!updatedEntry) return res.status(404).json(errorResponse('Timetable entry was not found.', 'ENTRY_NOT_FOUND'));
    const entries = current.entries.map((entry) => entry.id === req.params.entryId ? { ...entry, ...req.body } : entry);
    const data = await schedulingData();
    const result = new TimetableValidator({ ...data, entries, subjectRequirementsMap: data.subjectRequirements, divisionSubjects: data.divisionSubjects }).validate();
    if (!result.valid) return res.status(400).json(errorResponse('Edit rejected because it creates conflicts.', 'VALIDATION_FAILED', result.conflicts));
    res.json(successResponse(await updateEntry(req.params.versionId, req.params.entryId, { ...updatedEntry, ...req.body })));
  } catch (error) { next(error); }
});

router.post('/timetable/publish/:versionId', requireAuth, requirePermission(PERMISSIONS.PUBLISH_TIMETABLE), async (req, res, next) => {
  try { res.json(successResponse(await publishVersion(req.params.versionId))); } catch (error) { next(error); }
});

router.get('/timetable/current', requireAuth, requirePermission(PERMISSIONS.VIEW_TIMETABLE), async (_req, res, next) => {
  try {
    if (isSupabaseConfigured) return res.json(successResponse(await getCurrentTimetable()));
    const generated = buildGenerator().generate();
    res.json(successResponse({ entries: generated.entries, status: generated.valid ? 'ready' : 'conflicts' }));
  } catch (error) { next(error); }
});

router.get('/timetable/versions', requireAuth, requirePermission(PERMISSIONS.VIEW_VERSIONS), async (_req, res, next) => {
  try {
    if (!isSupabaseConfigured) return res.json(successResponse([]));
    res.json(successResponse(await getTimetableVersions()));
  } catch (error) { next(error); }
});

export default router;
