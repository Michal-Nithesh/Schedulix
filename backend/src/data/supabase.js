import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);

export const supabase = isSupabaseConfigured
  ? createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

export function assertSupabaseConfigured() {
  if (!supabase) {
    const error = new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    error.statusCode = 503;
    error.code = 'SUPABASE_NOT_CONFIGURED';
    throw error;
  }
}

async function read(table, columns = '*') {
  assertSupabaseConfigured();
  const { data, error } = await supabase.from(table).select(columns);
  if (error) throw error;
  return data || [];
}

export async function loadSchedulingData() {
  const [departments, divisions, subjects, facultyRows, facultySubjects, classrooms, timeSlots, facultyAvailability, roomAvailability, subjectRequirements, divisionSubjectRows] = await Promise.all([
    read('departments'),
    read('divisions'),
    read('subjects'),
    read('faculty'),
    read('faculty_subjects'),
    read('classrooms'),
    read('time_slots'),
    read('faculty_availability'),
    read('room_availability'),
    read('subject_requirements'),
    read('division_subjects'),
  ]);

  const qualifications = facultySubjects.reduce((map, row) => {
    (map[row.faculty_id] ||= []).push(row.subject_id);
    return map;
  }, {});

  const divisionSubjects = divisionSubjectRows.reduce((map, row) => {
    (map[row.division_id] ||= []).push({ subjectId: row.subject_id });
    return map;
  }, {});

  const facultyAvailabilityMap = facultyAvailability.reduce((map, row) => {
    (map[row.faculty_id] ||= {})[row.time_slot_id] = row.available;
    return map;
  }, {});

  const roomAvailabilityMap = roomAvailability.reduce((map, row) => {
    (map[row.classroom_id] ||= {})[row.time_slot_id] = row.available;
    return map;
  }, {});

  return {
    departments,
    divisions: divisions.map((row) => ({ ...row, departmentId: row.department_id, studentCount: row.student_count })),
    subjects: subjects.map((row) => ({ ...row, departmentId: row.department_id, requiredSessions: row.required_sessions, roomType: row.room_type })),
    faculty: facultyRows.map((row) => ({ ...row, departmentId: row.department_id, qualifications: qualifications[row.id] || [] })),
    classrooms: classrooms.map((row) => ({ ...row, roomType: row.room_type })),
    timeSlots: timeSlots.map((row) => ({ ...row, startTime: row.start_time, endTime: row.end_time })),
    facultyAvailabilityMap,
    roomAvailability: roomAvailabilityMap,
    divisionSubjects,
    subjectRequirements: subjectRequirements.map((row) => ({
      subjectId: row.subject_id,
      divisionId: row.division_id,
      requiredRoomType: row.required_room_type,
      requiredSeats: row.required_seats,
    })),
  };
}

export async function getRows(table, columns = '*') {
  return read(table, columns);
}

export async function createDraftVersion(entries, userId, name = `Draft ${new Date().toISOString().slice(0, 10)}`) {
  assertSupabaseConfigured();
  const { data: versions, error: versionError } = await supabase
    .from('timetable_versions')
    .select('version_number')
    .order('version_number', { ascending: false })
    .limit(1);
  if (versionError) throw versionError;

  const versionNumber = (versions?.[0]?.version_number || 0) + 1;
  const { data: version, error } = await supabase
    .from('timetable_versions')
    .insert({ version_number: versionNumber, name, status: 'draft', created_by: userId })
    .select()
    .single();
  if (error) throw error;

  const rows = entries.map((entry) => ({
    timetable_version_id: version.id,
    division_id: entry.divisionId,
    subject_id: entry.subjectId,
    faculty_id: entry.facultyId,
    classroom_id: entry.roomId,
    time_slot_id: entry.timeSlotId,
  }));
  const { data: savedEntries, error: entriesError } = await supabase.from('timetable_entries').insert(rows).select();
  if (entriesError) throw entriesError;

  return { version, entries: savedEntries.map(toEntry) };
}

export async function getCurrentTimetable() {
  assertSupabaseConfigured();
  const { data: version, error: versionError } = await supabase
    .from('timetable_versions')
    .select('*')
    .in('status', ['draft', 'published'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (versionError) throw versionError;
  if (!version) return { version: null, entries: [] };

  const { data, error } = await supabase.from('timetable_entries').select('*').eq('timetable_version_id', version.id);
  if (error) throw error;
  return { version, entries: (data || []).map(toEntry) };
}

export async function getTimetableVersions() {
  assertSupabaseConfigured();
  const { data: versions, error: versionsError } = await supabase
    .from('timetable_versions')
    .select('*')
    .order('created_at', { ascending: false });
  if (versionsError) throw versionsError;

  const { data: entries, error: entriesError } = await supabase
    .from('timetable_entries')
    .select('timetable_version_id');
  if (entriesError) throw entriesError;

  const counts = (entries || []).reduce((map, entry) => {
    map[entry.timetable_version_id] = (map[entry.timetable_version_id] || 0) + 1;
    return map;
  }, {});
  return (versions || []).map((version) => ({ ...version, session_count: counts[version.id] || 0 }));
}

export async function updateEntry(versionId, entryId, entry) {
  assertSupabaseConfigured();
  const { data, error } = await supabase.from('timetable_entries').update({
    division_id: entry.divisionId,
    subject_id: entry.subjectId,
    faculty_id: entry.facultyId,
    classroom_id: entry.roomId,
    time_slot_id: entry.timeSlotId,
  }).eq('id', entryId).eq('timetable_version_id', versionId).select().single();
  if (error) throw error;
  return toEntry(data);
}

export async function publishVersion(versionId) {
  assertSupabaseConfigured();
  const { error: archiveError } = await supabase.from('timetable_versions').update({ status: 'archived' }).eq('status', 'published');
  if (archiveError) throw archiveError;
  const { data, error } = await supabase.from('timetable_versions').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', versionId).eq('status', 'draft').select().single();
  if (error) throw error;
  return data;
}

function toEntry(row) {
  return {
    id: row.id,
    versionId: row.timetable_version_id,
    divisionId: row.division_id,
    subjectId: row.subject_id,
    facultyId: row.faculty_id,
    roomId: row.classroom_id,
    timeSlotId: row.time_slot_id,
  };
}
