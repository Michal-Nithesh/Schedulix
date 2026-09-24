-- Schedulix PostgreSQL / Supabase schema
-- The text identifiers match backend/src/data/seedData.js.

create extension if not exists "pgcrypto";

drop table if exists audit_logs, conflicts, timetable_entries, generation_runs,
  timetable_versions, subject_requirements, faculty_availability,
  room_availability, time_slots, classrooms, faculty_subjects, faculty,
  division_subjects, subjects, divisions, departments, app_users cascade;

create table app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'admin' check (role in ('admin', 'scheduler', 'viewer')),
  created_at timestamptz not null default now()
);

create table departments (
  id text primary key,
  name text not null,
  code text not null unique,
  created_at timestamptz not null default now()
);

create table divisions (
  id text primary key,
  department_id text not null references departments(id) on delete cascade,
  name text not null,
  student_count integer not null check (student_count > 0),
  unique (department_id, name)
);

create table subjects (
  id text primary key,
  department_id text not null references departments(id) on delete restrict,
  name text not null,
  required_sessions smallint not null check (required_sessions > 0),
  room_type text not null check (room_type in ('CLASSROOM', 'LAB')),
  capacity integer not null check (capacity > 0),
  unique (department_id, name)
);

create table division_subjects (
  division_id text not null references divisions(id) on delete cascade,
  subject_id text not null references subjects(id) on delete cascade,
  primary key (division_id, subject_id)
);

create table faculty (
  id text primary key,
  department_id text not null references departments(id) on delete restrict,
  name text not null
);

create table faculty_subjects (
  faculty_id text not null references faculty(id) on delete cascade,
  subject_id text not null references subjects(id) on delete cascade,
  primary key (faculty_id, subject_id)
);

create table classrooms (
  id text primary key,
  name text not null unique,
  room_type text not null check (room_type in ('CLASSROOM', 'LAB')),
  capacity integer not null check (capacity > 0)
);

create table time_slots (
  id text primary key,
  day text not null check (day in ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')),
  period smallint not null check (period > 0),
  label text not null,
  start_time time not null,
  end_time time not null,
  check (end_time > start_time),
  unique (day, period)
);

create table faculty_availability (
  faculty_id text not null references faculty(id) on delete cascade,
  time_slot_id text not null references time_slots(id) on delete cascade,
  available boolean not null default true,
  primary key (faculty_id, time_slot_id)
);

create table room_availability (
  classroom_id text not null references classrooms(id) on delete cascade,
  time_slot_id text not null references time_slots(id) on delete cascade,
  available boolean not null default true,
  primary key (classroom_id, time_slot_id)
);

create table subject_requirements (
  subject_id text not null references subjects(id) on delete cascade,
  division_id text not null references divisions(id) on delete cascade,
  required_room_type text not null check (required_room_type in ('CLASSROOM', 'LAB')),
  required_seats integer not null check (required_seats > 0),
  primary key (subject_id, division_id)
);

create table timetable_versions (
  id uuid primary key default gen_random_uuid(),
  version_number integer not null unique check (version_number > 0),
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'validated', 'published', 'archived')),
  created_by uuid references app_users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table generation_runs (
  id uuid primary key default gen_random_uuid(),
  timetable_version_id uuid references timetable_versions(id) on delete set null,
  status text not null check (status in ('running', 'completed', 'failed')),
  generated_count integer not null default 0 check (generated_count >= 0),
  conflict_count integer not null default 0 check (conflict_count >= 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table timetable_entries (
  id uuid primary key default gen_random_uuid(),
  timetable_version_id uuid not null references timetable_versions(id) on delete cascade,
  division_id text not null references divisions(id) on delete restrict,
  subject_id text not null references subjects(id) on delete restrict,
  faculty_id text not null references faculty(id) on delete restrict,
  classroom_id text not null references classrooms(id) on delete restrict,
  time_slot_id text not null references time_slots(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (timetable_version_id, division_id, time_slot_id),
  unique (timetable_version_id, faculty_id, time_slot_id),
  unique (timetable_version_id, classroom_id, time_slot_id)
);

create table conflicts (
  id uuid primary key default gen_random_uuid(),
  timetable_version_id uuid references timetable_versions(id) on delete cascade,
  generation_run_id uuid references generation_runs(id) on delete cascade,
  conflict_code text not null,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (timetable_version_id is not null or generation_run_id is not null)
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index timetable_entries_version_idx on timetable_entries(timetable_version_id);
create index conflicts_version_idx on conflicts(timetable_version_id);
create index conflicts_run_idx on conflicts(generation_run_id);
create index audit_logs_entity_idx on audit_logs(entity_type, entity_id);

alter table app_users enable row level security;
alter table departments enable row level security;
alter table divisions enable row level security;
alter table subjects enable row level security;
alter table division_subjects enable row level security;
alter table faculty enable row level security;
alter table classrooms enable row level security;
alter table time_slots enable row level security;
alter table faculty_availability enable row level security;
alter table room_availability enable row level security;
alter table subject_requirements enable row level security;
alter table timetable_versions enable row level security;
alter table generation_runs enable row level security;
alter table timetable_entries enable row level security;
alter table conflicts enable row level security;
alter table audit_logs enable row level security;

-- The API service role bypasses RLS. Add user-facing policies when auth is wired in.
