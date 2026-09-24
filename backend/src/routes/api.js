import express from 'express';
import { seedData } from '../data/seedData.js';
import {
  isSupabaseConfigured,
  loadSchedulingData,
  createDraftVersion,
  getCurrentTimetable,
  getTimetableVersions,
  updateEntry,
  publishVersion,
  supabase,
} from '../data/supabase.js';
import { TimetableGenerator } from '../algorithms/TimetableGenerator.js';
import { TimetableValidator } from '../validators/TimetableValidator.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';
import { PERMISSIONS, normalizeRole, requireAuth, requirePermission } from '../auth/rbac.js';

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

const ROOM_TYPES = new Set(['CLASSROOM', 'LAB']);

function requireDatabase(res, message) {
  if (!isSupabaseConfigured) {
    res.status(503).json(errorResponse(message, 'SUPABASE_NOT_CONFIGURED'));
    return false;
  }
  return true;
}

function validationError(res, message) {
  return res.status(400).json(errorResponse(message, 'VALIDATION_ERROR'));
}

function dependencyError(res, message) {
  return res.status(409).json(errorResponse(message, 'DEPENDENCY_EXISTS'));
}

function mapDbError(error, res, fallback) {
  if (error?.code === '23505') return res.status(409).json(errorResponse(fallback, 'DUPLICATE_RECORD'));
  if (error?.code === '23503') return dependencyError(res, 'This record is still used by related scheduling data.');
  throw error;
}

router.get('/auth/me', requireAuth, (req, res) => {
  res.json(successResponse({ user: req.user }));
});

router.get('/departments', requireAuth, requirePermission(PERMISSIONS.VIEW_DATA), async (_req, res, next) => {
  try {
    res.json(successResponse((await schedulingData()).departments));
  } catch (error) {
    next(error);
  }
});

router.post('/departments', requireAuth, requirePermission(PERMISSIONS.MANAGE_DEPARTMENTS), async (req, res, next) => {
  try {
    if (!isSupabaseConfigured)
      return res
        .status(503)
        .json(errorResponse('Supabase is required to create departments.', 'SUPABASE_NOT_CONFIGURED'));

    const name = String(req.body?.name || '').trim();
    const code = String(req.body?.code || '')
      .trim()
      .toUpperCase();
    const id = code
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    if (!name || !code)
      return res.status(400).json(errorResponse('Department name and code are required.', 'VALIDATION_ERROR'));
    if (!id)
      return res
        .status(400)
        .json(errorResponse('Department code must contain letters or numbers.', 'VALIDATION_ERROR'));

    const { data, error } = await supabase.from('departments').insert({ id, name, code }).select().single();
    if (error?.code === '23505')
      return res.status(409).json(errorResponse('A department with that code already exists.', 'DEPARTMENT_EXISTS'));
    if (error) throw error;
    res.status(201).json(successResponse(data));
  } catch (error) {
    next(error);
  }
});

router.put(
  '/departments/:id',
  requireAuth,
  requirePermission(PERMISSIONS.MANAGE_DEPARTMENTS),
  async (req, res, next) => {
    try {
      if (!isSupabaseConfigured)
        return res
          .status(503)
          .json(errorResponse('Supabase is required to edit departments.', 'SUPABASE_NOT_CONFIGURED'));

      const name = String(req.body?.name || '').trim();
      const code = String(req.body?.code || '')
        .trim()
        .toUpperCase();
      if (!name || !code)
        return res.status(400).json(errorResponse('Department name and code are required.', 'VALIDATION_ERROR'));

      const { data, error } = await supabase
        .from('departments')
        .update({ name, code })
        .eq('id', req.params.id)
        .select()
        .single();
      if (error?.code === '23505')
        return res.status(409).json(errorResponse('A department with that code already exists.', 'DEPARTMENT_EXISTS'));
      if (error?.code === 'PGRST116')
        return res.status(404).json(errorResponse('Department was not found.', 'DEPARTMENT_NOT_FOUND'));
      if (error) throw error;
      res.json(successResponse(data));
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/departments/:id',
  requireAuth,
  requirePermission(PERMISSIONS.MANAGE_DEPARTMENTS),
  async (req, res, next) => {
    try {
      if (!requireDatabase(res, 'Supabase is required to delete departments.')) return;
      const { error } = await supabase.from('departments').delete().eq('id', req.params.id);
      if (error)
        return mapDbError(
          error,
          res,
          'Cannot delete this department because it is used by divisions, subjects, or faculty.',
        );
      res.json(successResponse({ id: req.params.id }));
    } catch (error) {
      next(error);
    }
  },
);

router.get('/divisions', requireAuth, requirePermission(PERMISSIONS.VIEW_DATA), async (_req, res, next) => {
  try {
    res.json(successResponse((await schedulingData()).divisions));
  } catch (error) {
    next(error);
  }
});

router.post('/divisions', requireAuth, requirePermission(PERMISSIONS.MANAGE_DIVISIONS), async (req, res, next) => {
  try {
    if (!requireDatabase(res, 'Supabase is required to create divisions.')) return;
    const id = String(req.body?.id || '').trim();
    const departmentId = String(req.body?.departmentId || '').trim();
    const name = String(req.body?.name || '').trim();
    const studentCount = Number(req.body?.studentCount);
    if (!id || !departmentId || !name) return validationError(res, 'Division ID, department, and name are required.');
    if (!Number.isInteger(studentCount) || studentCount <= 0)
      return validationError(res, 'Student count must be greater than zero.');
    const { data, error } = await supabase
      .from('divisions')
      .insert({ id, department_id: departmentId, name, student_count: studentCount })
      .select()
      .single();
    if (error) return mapDbError(error, res, 'A division with that ID or name already exists.');
    res
      .status(201)
      .json(successResponse({ ...data, departmentId: data.department_id, studentCount: data.student_count }));
  } catch (error) {
    next(error);
  }
});

router.put('/divisions/:id', requireAuth, requirePermission(PERMISSIONS.MANAGE_DIVISIONS), async (req, res, next) => {
  try {
    if (!requireDatabase(res, 'Supabase is required to edit divisions.')) return;
    const departmentId = String(req.body?.departmentId || '').trim();
    const name = String(req.body?.name || '').trim();
    const studentCount = Number(req.body?.studentCount);
    if (!departmentId || !name) return validationError(res, 'Department and name are required.');
    if (!Number.isInteger(studentCount) || studentCount <= 0)
      return validationError(res, 'Student count must be greater than zero.');
    const { data, error } = await supabase
      .from('divisions')
      .update({ department_id: departmentId, name, student_count: studentCount })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error?.code === 'PGRST116')
      return res.status(404).json(errorResponse('Division was not found.', 'DIVISION_NOT_FOUND'));
    if (error) return mapDbError(error, res, 'A division with that name already exists in this department.');
    res.json(successResponse({ ...data, departmentId: data.department_id, studentCount: data.student_count }));
  } catch (error) {
    next(error);
  }
});

router.delete(
  '/divisions/:id',
  requireAuth,
  requirePermission(PERMISSIONS.MANAGE_DIVISIONS),
  async (req, res, next) => {
    try {
      if (!requireDatabase(res, 'Supabase is required to delete divisions.')) return;
      const { error } = await supabase.from('divisions').delete().eq('id', req.params.id);
      if (error)
        return mapDbError(
          error,
          res,
          'Cannot delete this division because it is used by assignments, requirements, or timetables.',
        );
      res.json(successResponse({ id: req.params.id }));
    } catch (error) {
      next(error);
    }
  },
);

router.get('/subjects', requireAuth, requirePermission(PERMISSIONS.VIEW_DATA), async (_req, res, next) => {
  try {
    res.json(successResponse((await schedulingData()).subjects));
  } catch (error) {
    next(error);
  }
});

router.post('/subjects', requireAuth, requirePermission(PERMISSIONS.MANAGE_SUBJECTS), async (req, res, next) => {
  try {
    if (!requireDatabase(res, 'Supabase is required to create subjects.')) return;
    const id = String(req.body?.id || '').trim();
    const departmentId = String(req.body?.departmentId || '').trim();
    const name = String(req.body?.name || '').trim();
    const requiredSessions = Number(req.body?.requiredSessions);
    const roomType = String(req.body?.roomType || '')
      .trim()
      .toUpperCase();
    const capacity = Number(req.body?.capacity);
    if (!id || !departmentId || !name) return validationError(res, 'Subject ID, department, and name are required.');
    if (!Number.isInteger(requiredSessions) || requiredSessions <= 0)
      return validationError(res, 'Required sessions must be greater than zero.');
    if (!Number.isInteger(capacity) || capacity <= 0)
      return validationError(res, 'Capacity must be greater than zero.');
    if (!ROOM_TYPES.has(roomType)) return validationError(res, 'Room type must be CLASSROOM or LAB.');
    const { data, error } = await supabase
      .from('subjects')
      .insert({
        id,
        department_id: departmentId,
        name,
        required_sessions: requiredSessions,
        room_type: roomType,
        capacity,
      })
      .select()
      .single();
    if (error) return mapDbError(error, res, 'A subject with that ID or name already exists.');
    res.status(201).json(
      successResponse({
        ...data,
        departmentId: data.department_id,
        requiredSessions: data.required_sessions,
        roomType: data.room_type,
      }),
    );
  } catch (error) {
    next(error);
  }
});

router.put('/subjects/:id', requireAuth, requirePermission(PERMISSIONS.MANAGE_SUBJECTS), async (req, res, next) => {
  try {
    if (!requireDatabase(res, 'Supabase is required to edit subjects.')) return;
    const departmentId = String(req.body?.departmentId || '').trim();
    const name = String(req.body?.name || '').trim();
    const requiredSessions = Number(req.body?.requiredSessions);
    const roomType = String(req.body?.roomType || '')
      .trim()
      .toUpperCase();
    const capacity = Number(req.body?.capacity);
    if (!departmentId || !name) return validationError(res, 'Department and name are required.');
    if (!Number.isInteger(requiredSessions) || requiredSessions <= 0)
      return validationError(res, 'Required sessions must be greater than zero.');
    if (!Number.isInteger(capacity) || capacity <= 0)
      return validationError(res, 'Capacity must be greater than zero.');
    if (!ROOM_TYPES.has(roomType)) return validationError(res, 'Room type must be CLASSROOM or LAB.');
    const { data, error } = await supabase
      .from('subjects')
      .update({ department_id: departmentId, name, required_sessions: requiredSessions, room_type: roomType, capacity })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error?.code === 'PGRST116')
      return res.status(404).json(errorResponse('Subject was not found.', 'SUBJECT_NOT_FOUND'));
    if (error) return mapDbError(error, res, 'A subject with that name already exists in this department.');
    res.json(
      successResponse({
        ...data,
        departmentId: data.department_id,
        requiredSessions: data.required_sessions,
        roomType: data.room_type,
      }),
    );
  } catch (error) {
    next(error);
  }
});

router.delete('/subjects/:id', requireAuth, requirePermission(PERMISSIONS.MANAGE_SUBJECTS), async (req, res, next) => {
  try {
    if (!requireDatabase(res, 'Supabase is required to delete subjects.')) return;
    const { error } = await supabase.from('subjects').delete().eq('id', req.params.id);
    if (error)
      return mapDbError(
        error,
        res,
        'Cannot delete this subject because it is used by mappings, qualifications, requirements, or timetables.',
      );
    res.json(successResponse({ id: req.params.id }));
  } catch (error) {
    next(error);
  }
});

router.get('/faculty', requireAuth, requirePermission(PERMISSIONS.VIEW_DATA), async (_req, res, next) => {
  try {
    res.json(successResponse((await schedulingData()).faculty));
  } catch (error) {
    next(error);
  }
});

router.post('/faculty', requireAuth, requirePermission(PERMISSIONS.MANAGE_FACULTY), async (req, res, next) => {
  try {
    if (!requireDatabase(res, 'Supabase is required to create faculty.')) return;
    const id = String(req.body?.id || '').trim();
    const departmentId = String(req.body?.departmentId || '').trim();
    const name = String(req.body?.name || '').trim();
    if (!id || !departmentId || !name) return validationError(res, 'Faculty ID, department, and name are required.');
    const { data, error } = await supabase
      .from('faculty')
      .insert({ id, department_id: departmentId, name })
      .select()
      .single();
    if (error) return mapDbError(error, res, 'A faculty member with that ID already exists.');
    res.status(201).json(successResponse({ ...data, departmentId: data.department_id, qualifications: [] }));
  } catch (error) {
    next(error);
  }
});

router.put('/faculty/:id', requireAuth, requirePermission(PERMISSIONS.MANAGE_FACULTY), async (req, res, next) => {
  try {
    if (!requireDatabase(res, 'Supabase is required to edit faculty.')) return;
    const departmentId = String(req.body?.departmentId || '').trim();
    const name = String(req.body?.name || '').trim();
    if (!departmentId || !name) return validationError(res, 'Department and name are required.');
    const { data, error } = await supabase
      .from('faculty')
      .update({ department_id: departmentId, name })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error?.code === 'PGRST116')
      return res.status(404).json(errorResponse('Faculty member was not found.', 'FACULTY_NOT_FOUND'));
    if (error) return mapDbError(error, res, 'Unable to update this faculty member.');
    res.json(successResponse({ ...data, departmentId: data.department_id }));
  } catch (error) {
    next(error);
  }
});

router.delete('/faculty/:id', requireAuth, requirePermission(PERMISSIONS.MANAGE_FACULTY), async (req, res, next) => {
  try {
    if (!requireDatabase(res, 'Supabase is required to delete faculty.')) return;
    const { error } = await supabase.from('faculty').delete().eq('id', req.params.id);
    if (error)
      return mapDbError(
        error,
        res,
        'Cannot delete this faculty member because it is used by qualifications, availability, or timetables.',
      );
    res.json(successResponse({ id: req.params.id }));
  } catch (error) {
    next(error);
  }
});

router.get('/faculty/:id/subjects', requireAuth, requirePermission(PERMISSIONS.VIEW_DATA), async (req, res, next) => {
  try {
    if (!requireDatabase(res, 'Supabase is required to read faculty qualifications.')) return;
    const { data, error } = await supabase
      .from('faculty_subjects')
      .select('subject_id')
      .eq('faculty_id', req.params.id);
    if (error) throw error;
    res.json(successResponse((data || []).map((row) => row.subject_id)));
  } catch (error) {
    next(error);
  }
});

router.post(
  '/faculty/:id/subjects',
  requireAuth,
  requirePermission(PERMISSIONS.MANAGE_FACULTY),
  async (req, res, next) => {
    try {
      if (!requireDatabase(res, 'Supabase is required to update faculty qualifications.')) return;
      const subjectIds = Array.isArray(req.body?.subjectIds) ? [...new Set(req.body.subjectIds.map(String))] : [];
      const { error: deleteError } = await supabase.from('faculty_subjects').delete().eq('faculty_id', req.params.id);
      if (deleteError) throw deleteError;
      if (subjectIds.length) {
        const { error } = await supabase
          .from('faculty_subjects')
          .insert(subjectIds.map((subjectId) => ({ faculty_id: req.params.id, subject_id: subjectId })));
        if (error) return mapDbError(error, res, 'One or more selected subjects are invalid.');
      }
      res.json(successResponse({ facultyId: req.params.id, subjectIds }));
    } catch (error) {
      next(error);
    }
  },
);

router.get('/classrooms', requireAuth, requirePermission(PERMISSIONS.VIEW_DATA), async (_req, res, next) => {
  try {
    res.json(successResponse((await schedulingData()).classrooms));
  } catch (error) {
    next(error);
  }
});

router.post('/classrooms', requireAuth, requirePermission(PERMISSIONS.MANAGE_CLASSROOMS), async (req, res, next) => {
  try {
    if (!requireDatabase(res, 'Supabase is required to create classrooms.')) return;
    const id = String(req.body?.id || '').trim();
    const name = String(req.body?.name || '').trim();
    const roomType = String(req.body?.roomType || '')
      .trim()
      .toUpperCase();
    const capacity = Number(req.body?.capacity);
    if (!id || !name) return validationError(res, 'Room ID and name are required.');
    if (!Number.isInteger(capacity) || capacity <= 0)
      return validationError(res, 'Capacity must be greater than zero.');
    if (!ROOM_TYPES.has(roomType)) return validationError(res, 'Room type must be CLASSROOM or LAB.');
    const { data, error } = await supabase
      .from('classrooms')
      .insert({ id, name, room_type: roomType, capacity })
      .select()
      .single();
    if (error) return mapDbError(error, res, 'A classroom with that ID or name already exists.');
    res.status(201).json(successResponse({ ...data, roomType: data.room_type }));
  } catch (error) {
    next(error);
  }
});

router.put('/classrooms/:id', requireAuth, requirePermission(PERMISSIONS.MANAGE_CLASSROOMS), async (req, res, next) => {
  try {
    if (!requireDatabase(res, 'Supabase is required to edit classrooms.')) return;
    const name = String(req.body?.name || '').trim();
    const roomType = String(req.body?.roomType || '')
      .trim()
      .toUpperCase();
    const capacity = Number(req.body?.capacity);
    if (!name) return validationError(res, 'Room name is required.');
    if (!Number.isInteger(capacity) || capacity <= 0)
      return validationError(res, 'Capacity must be greater than zero.');
    if (!ROOM_TYPES.has(roomType)) return validationError(res, 'Room type must be CLASSROOM or LAB.');
    const { data, error } = await supabase
      .from('classrooms')
      .update({ name, room_type: roomType, capacity })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error?.code === 'PGRST116')
      return res.status(404).json(errorResponse('Classroom was not found.', 'CLASSROOM_NOT_FOUND'));
    if (error) return mapDbError(error, res, 'A classroom with that name already exists.');
    res.json(successResponse({ ...data, roomType: data.room_type }));
  } catch (error) {
    next(error);
  }
});

router.delete(
  '/classrooms/:id',
  requireAuth,
  requirePermission(PERMISSIONS.MANAGE_CLASSROOMS),
  async (req, res, next) => {
    try {
      if (!requireDatabase(res, 'Supabase is required to delete classrooms.')) return;
      const { error } = await supabase.from('classrooms').delete().eq('id', req.params.id);
      if (error)
        return mapDbError(error, res, 'Cannot delete this classroom because it is used by availability or timetables.');
      res.json(successResponse({ id: req.params.id }));
    } catch (error) {
      next(error);
    }
  },
);

router.get('/time-slots', requireAuth, requirePermission(PERMISSIONS.VIEW_DATA), async (_req, res, next) => {
  try {
    res.json(successResponse((await schedulingData()).timeSlots));
  } catch (error) {
    next(error);
  }
});

router.get('/division-subjects', requireAuth, requirePermission(PERMISSIONS.VIEW_DATA), async (_req, res, next) => {
  try {
    res.json(successResponse((await schedulingData()).divisionSubjects || {}));
  } catch (error) {
    next(error);
  }
});

router.get('/subject-requirements', requireAuth, requirePermission(PERMISSIONS.VIEW_DATA), async (_req, res, next) => {
  try {
    res.json(successResponse((await schedulingData()).subjectRequirements || []));
  } catch (error) {
    next(error);
  }
});

router.put(
  '/division-subjects/:divisionId',
  requireAuth,
  requirePermission(PERMISSIONS.MANAGE_DIVISION_SUBJECTS),
  async (req, res, next) => {
    try {
      if (!isSupabaseConfigured)
        return res
          .status(503)
          .json(errorResponse('Supabase is required for configuration changes.', 'SUPABASE_NOT_CONFIGURED'));
      const rows = (Array.isArray(req.body.subjectIds) ? req.body.subjectIds : []).map((subjectId) => ({
        division_id: req.params.divisionId,
        subject_id: subjectId,
      }));
      const { error: deleteError } = await supabase
        .from('division_subjects')
        .delete()
        .eq('division_id', req.params.divisionId);
      if (deleteError) throw deleteError;
      if (rows.length) {
        const { error } = await supabase.from('division_subjects').insert(rows);
        if (error) throw error;
      }
      res.json(successResponse({ divisionId: req.params.divisionId, subjectIds: rows.map((row) => row.subject_id) }));
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/division-subjects',
  requireAuth,
  requirePermission(PERMISSIONS.MANAGE_DIVISION_SUBJECTS),
  async (req, res, next) => {
    try {
      if (!requireDatabase(res, 'Supabase is required to create subject assignments.')) return;
      const divisionId = String(req.body?.divisionId || '').trim();
      const subjectId = String(req.body?.subjectId || '').trim();
      if (!divisionId || !subjectId) return validationError(res, 'Division and subject are required.');
      const { data, error } = await supabase
        .from('division_subjects')
        .insert({ division_id: divisionId, subject_id: subjectId })
        .select()
        .single();
      if (error)
        return mapDbError(
          error,
          res,
          'This subject is already assigned to the division or the selected records are invalid.',
        );
      res.status(201).json(successResponse({ divisionId: data.division_id, subjectId: data.subject_id }));
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/division-subjects/:divisionId/:subjectId',
  requireAuth,
  requirePermission(PERMISSIONS.MANAGE_DIVISION_SUBJECTS),
  async (req, res, next) => {
    try {
      if (!requireDatabase(res, 'Supabase is required to remove subject assignments.')) return;
      const { error } = await supabase
        .from('division_subjects')
        .delete()
        .eq('division_id', req.params.divisionId)
        .eq('subject_id', req.params.subjectId);
      if (error) throw error;
      res.json(successResponse({ divisionId: req.params.divisionId, subjectId: req.params.subjectId }));
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/subject-requirements/:subjectId/:divisionId',
  requireAuth,
  requirePermission(PERMISSIONS.MANAGE_REQUIREMENTS),
  async (req, res, next) => {
    try {
      if (!isSupabaseConfigured)
        return res
          .status(503)
          .json(errorResponse('Supabase is required for configuration changes.', 'SUPABASE_NOT_CONFIGURED'));
      const row = {
        subject_id: req.params.subjectId,
        division_id: req.params.divisionId,
        required_room_type: String(req.body.requiredRoomType || '').toUpperCase(),
        required_seats: Number(req.body.requiredSeats),
      };
      if (!ROOM_TYPES.has(row.required_room_type))
        return validationError(res, 'Required room type must be CLASSROOM or LAB.');
      if (!Number.isInteger(row.required_seats) || row.required_seats <= 0)
        return validationError(res, 'Required seats must be greater than zero.');
      const { data: assignment } = await supabase
        .from('division_subjects')
        .select('division_id')
        .eq('division_id', row.division_id)
        .eq('subject_id', row.subject_id)
        .maybeSingle();
      if (!assignment) return validationError(res, 'Assign the subject to the division before creating a requirement.');
      const { data, error } = await supabase.from('subject_requirements').upsert(row).select().single();
      if (error) throw error;
      res.json(successResponse(data));
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/subject-requirements/:subjectId/:divisionId',
  requireAuth,
  requirePermission(PERMISSIONS.MANAGE_REQUIREMENTS),
  async (req, res, next) => {
    try {
      if (!requireDatabase(res, 'Supabase is required to delete subject requirements.')) return;
      const { error } = await supabase
        .from('subject_requirements')
        .delete()
        .eq('subject_id', req.params.subjectId)
        .eq('division_id', req.params.divisionId);
      if (error) throw error;
      res.json(successResponse({ subjectId: req.params.subjectId, divisionId: req.params.divisionId }));
    } catch (error) {
      next(error);
    }
  },
);

router.get('/availability/faculty', requireAuth, requirePermission(PERMISSIONS.VIEW_DATA), async (_req, res, next) => {
  try {
    if (!requireDatabase(res, 'Supabase is required to read faculty availability.')) return;
    const { data, error } = await supabase.from('faculty_availability').select('*');
    if (error) throw error;
    res.json(successResponse(data || []));
  } catch (error) {
    next(error);
  }
});

router.put(
  '/availability/faculty',
  requireAuth,
  requirePermission(PERMISSIONS.MANAGE_AVAILABILITY),
  async (req, res, next) => {
    try {
      if (!requireDatabase(res, 'Supabase is required to update faculty availability.')) return;
      const facultyId = String(req.body?.facultyId || '').trim();
      const timeSlotId = String(req.body?.timeSlotId || '').trim();
      if (!facultyId || !timeSlotId || typeof req.body?.available !== 'boolean')
        return validationError(res, 'Faculty, time slot, and availability are required.');
      const { data, error } = await supabase
        .from('faculty_availability')
        .upsert({ faculty_id: facultyId, time_slot_id: timeSlotId, available: req.body.available })
        .select()
        .single();
      if (error) return mapDbError(error, res, 'The selected faculty or time slot is invalid.');
      res.json(successResponse(data));
    } catch (error) {
      next(error);
    }
  },
);

router.get('/availability/rooms', requireAuth, requirePermission(PERMISSIONS.VIEW_DATA), async (_req, res, next) => {
  try {
    if (!requireDatabase(res, 'Supabase is required to read room availability.')) return;
    const { data, error } = await supabase.from('room_availability').select('*');
    if (error) throw error;
    res.json(successResponse(data || []));
  } catch (error) {
    next(error);
  }
});

router.put(
  '/availability/rooms',
  requireAuth,
  requirePermission(PERMISSIONS.MANAGE_AVAILABILITY),
  async (req, res, next) => {
    try {
      if (!requireDatabase(res, 'Supabase is required to update room availability.')) return;
      const classroomId = String(req.body?.classroomId || '').trim();
      const timeSlotId = String(req.body?.timeSlotId || '').trim();
      if (!classroomId || !timeSlotId || typeof req.body?.available !== 'boolean')
        return validationError(res, 'Room, time slot, and availability are required.');
      const { data, error } = await supabase
        .from('room_availability')
        .upsert({ classroom_id: classroomId, time_slot_id: timeSlotId, available: req.body.available })
        .select()
        .single();
      if (error) return mapDbError(error, res, 'The selected room or time slot is invalid.');
      res.json(successResponse(data));
    } catch (error) {
      next(error);
    }
  },
);

router.get('/users', requireAuth, requirePermission(PERMISSIONS.MANAGE_USERS), async (_req, res, next) => {
  try {
    if (!requireDatabase(res, 'Supabase is required to read users.')) return;
    const [{ data: authData, error: authError }, { data: profiles, error: profileError }] = await Promise.all([
      supabase.auth.admin.listUsers({ perPage: 1000 }),
      supabase.from('app_users').select('id, display_name, role, created_at'),
    ]);
    if (authError) throw authError;
    if (profileError) throw profileError;
    const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
    res.json(
      successResponse(
        (authData.users || []).map((authUser) => {
          const profile = profileMap.get(authUser.id);
          return {
            id: authUser.id,
            display_name: profile?.display_name || authUser.user_metadata?.display_name || authUser.email,
            email: authUser.email,
            role: normalizeRole(profile?.role) || 'VIEWER',
            created_at: profile?.created_at || authUser.created_at,
          };
        }),
      ),
    );
  } catch (error) {
    next(error);
  }
});

router.post('/users', requireAuth, requirePermission(PERMISSIONS.MANAGE_USERS), async (req, res, next) => {
  try {
    if (!requireDatabase(res, 'Supabase is required to invite users.')) return;
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase();
    const displayName = String(req.body?.displayName || '').trim();
    const role = normalizeRole(req.body?.role) || 'VIEWER';
    if (!email || !displayName) return validationError(res, 'Display name and email are required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return validationError(res, 'Enter a valid email address.');
    const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { display_name: displayName },
    });
    if (inviteError) {
      if (inviteError.code === 'email_exists')
        return res.status(409).json(errorResponse('A user with that email already exists.', 'USER_EXISTS'));
      throw inviteError;
    }
    const { data: profile, error: profileError } = await supabase
      .from('app_users')
      .update({ display_name: displayName, role })
      .eq('id', invited.user.id)
      .select('id, display_name, role, created_at')
      .single();
    if (profileError) throw profileError;
    res.status(201).json(successResponse({ ...profile, email }));
  } catch (error) {
    next(error);
  }
});

router.put('/users/:id/role', requireAuth, requirePermission(PERMISSIONS.MANAGE_ROLES), async (req, res, next) => {
  try {
    if (!requireDatabase(res, 'Supabase is required to update user roles.')) return;
    const role = normalizeRole(req.body?.role);
    if (!role) return validationError(res, 'Role must be ADMINISTRATOR, SCHEDULER, or VIEWER.');
    if (req.user.id === req.params.id && role !== 'ADMINISTRATOR')
      return validationError(res, 'You cannot remove your own administrator access.');
    const { data, error } = await supabase
      .from('app_users')
      .update({ role })
      .eq('id', req.params.id)
      .select('id, display_name, role, created_at')
      .single();
    if (error?.code === 'PGRST116')
      return res.status(404).json(errorResponse('User profile was not found.', 'USER_NOT_FOUND'));
    if (error) throw error;
    res.json(successResponse(data));
  } catch (error) {
    next(error);
  }
});

router.post('/users', requireAuth, requirePermission(PERMISSIONS.MANAGE_USERS), (_req, res) => {
  res.status(405).json(errorResponse('Users must be created through Supabase Auth.', 'AUTH_USER_CREATION_REQUIRED'));
});

router.get('/audit-logs', requireAuth, requirePermission(PERMISSIONS.VIEW_AUDIT_LOGS), (_req, res) => {
  res.json(
    successResponse([
      {
        id: 'audit-1',
        action: 'Timetable generated',
        resource: 'timetable',
        user: 'admin@schedulix.app',
        createdAt: new Date().toISOString(),
      },
    ]),
  );
});

router.get('/settings', requireAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), (_req, res) => {
  res.json(
    successResponse({
      appName: 'Schedulix',
      maintenanceMode: false,
      defaultRole: 'SCHEDULER',
    }),
  );
});

router.post(
  '/timetable/generate',
  requireAuth,
  requirePermission(PERMISSIONS.GENERATE_TIMETABLE),
  async (_req, res, next) => {
    try {
      const result = buildGenerator(await schedulingData()).generate();

      const required =
        result.entries.length +
        result.conflicts.reduce(
          (total, conflict) =>
            total + Math.max(0, (conflict.requiredSessions || 0) - (conflict.scheduledSessions || 0)),
          0,
        );
      res.json(
        successResponse({
          status: result.status,
          entries: result.entries,
          conflicts: result.conflicts,
          summary: { generated: result.entries.length, required, conflicts: result.conflicts.length },
        }),
      );
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/timetable/validate',
  requireAuth,
  requirePermission(PERMISSIONS.VALIDATE_TIMETABLE),
  async (req, res, next) => {
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
    } catch (error) {
      next(error);
    }
  },
);

router.post('/timetable/drafts', requireAuth, requirePermission(PERMISSIONS.EDIT_TIMETABLE), async (req, res, next) => {
  try {
    const entries = Array.isArray(req.body.entries) ? req.body.entries : [];
    const data = await schedulingData();
    const result = new TimetableValidator({
      ...data,
      entries,
      subjectRequirementsMap: data.subjectRequirements,
      divisionSubjects: data.divisionSubjects,
    }).validate();
    if (!result.valid)
      return res
        .status(400)
        .json(errorResponse('Draft contains conflicts and was not saved.', 'VALIDATION_FAILED', result.conflicts));
    res.status(201).json(successResponse(await createDraftVersion(entries, req.user.id, req.body.name)));
  } catch (error) {
    next(error);
  }
});

router.patch(
  '/timetable/entries/:versionId/:entryId',
  requireAuth,
  requirePermission(PERMISSIONS.EDIT_TIMETABLE),
  async (req, res, next) => {
    try {
      const current = await getCurrentTimetable();
      const updatedEntry = current.entries.find((entry) => entry.id === req.params.entryId);
      if (!updatedEntry)
        return res.status(404).json(errorResponse('Timetable entry was not found.', 'ENTRY_NOT_FOUND'));
      const entries = current.entries.map((entry) =>
        entry.id === req.params.entryId ? { ...entry, ...req.body } : entry,
      );
      const data = await schedulingData();
      const result = new TimetableValidator({
        ...data,
        entries,
        subjectRequirementsMap: data.subjectRequirements,
        divisionSubjects: data.divisionSubjects,
      }).validate();
      if (!result.valid)
        return res
          .status(400)
          .json(errorResponse('Edit rejected because it creates conflicts.', 'VALIDATION_FAILED', result.conflicts));
      res.json(
        successResponse(await updateEntry(req.params.versionId, req.params.entryId, { ...updatedEntry, ...req.body })),
      );
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/timetable/publish/:versionId',
  requireAuth,
  requirePermission(PERMISSIONS.PUBLISH_TIMETABLE),
  async (req, res, next) => {
    try {
      res.json(successResponse(await publishVersion(req.params.versionId)));
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/timetable/current',
  requireAuth,
  requirePermission(PERMISSIONS.VIEW_TIMETABLE),
  async (_req, res, next) => {
    try {
      if (isSupabaseConfigured) return res.json(successResponse(await getCurrentTimetable()));
      const generated = buildGenerator().generate();
      res.json(successResponse({ entries: generated.entries, status: generated.valid ? 'ready' : 'conflicts' }));
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/timetable/versions',
  requireAuth,
  requirePermission(PERMISSIONS.VIEW_VERSIONS),
  async (_req, res, next) => {
    try {
      if (!isSupabaseConfigured) return res.json(successResponse([]));
      res.json(successResponse(await getTimetableVersions()));
    } catch (error) {
      next(error);
    }
  },
);

export default router;
