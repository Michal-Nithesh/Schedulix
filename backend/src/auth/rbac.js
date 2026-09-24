import { errorResponse } from '../utils/apiResponse.js';
import { supabase, isSupabaseConfigured } from '../data/supabase.js';

export const PERMISSIONS = {
  VIEW_DASHBOARD: 'VIEW_DASHBOARD',
  VIEW_DATA: 'VIEW_DATA',
  VIEW_TIMETABLE: 'VIEW_TIMETABLE',
  VIEW_VERSIONS: 'VIEW_VERSIONS',
  VIEW_REPORTS: 'VIEW_REPORTS',
  VIEW_AUDIT_LOGS: 'VIEW_AUDIT_LOGS',

  MANAGE_DEPARTMENTS: 'MANAGE_DEPARTMENTS',
  MANAGE_DIVISIONS: 'MANAGE_DIVISIONS',
  MANAGE_SUBJECTS: 'MANAGE_SUBJECTS',
  MANAGE_FACULTY: 'MANAGE_FACULTY',
  MANAGE_CLASSROOMS: 'MANAGE_CLASSROOMS',
  MANAGE_TIME_SLOTS: 'MANAGE_TIME_SLOTS',
  MANAGE_AVAILABILITY: 'MANAGE_AVAILABILITY',
  MANAGE_REQUIREMENTS: 'MANAGE_REQUIREMENTS',
  MANAGE_DIVISION_SUBJECTS: 'MANAGE_DIVISION_SUBJECTS',

  GENERATE_TIMETABLE: 'GENERATE_TIMETABLE',
  EDIT_TIMETABLE: 'EDIT_TIMETABLE',
  VALIDATE_TIMETABLE: 'VALIDATE_TIMETABLE',
  RESOLVE_CONFLICTS: 'RESOLVE_CONFLICTS',
  PUBLISH_TIMETABLE: 'PUBLISH_TIMETABLE',

  MANAGE_USERS: 'MANAGE_USERS',
  MANAGE_ROLES: 'MANAGE_ROLES',
  MANAGE_SETTINGS: 'MANAGE_SETTINGS',
};

export const ROLE_LABELS = {
  ADMINISTRATOR: 'Administrator',
  SCHEDULER: 'Scheduler',
  VIEWER: 'Viewer',
};

export const ROLE_PERMISSIONS = {
  ADMINISTRATOR: Object.values(PERMISSIONS),
  SCHEDULER: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_DATA,
    PERMISSIONS.VIEW_TIMETABLE,
    PERMISSIONS.VIEW_VERSIONS,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.MANAGE_DIVISIONS,
    PERMISSIONS.MANAGE_SUBJECTS,
    PERMISSIONS.MANAGE_AVAILABILITY,
    PERMISSIONS.MANAGE_REQUIREMENTS,
    PERMISSIONS.MANAGE_DIVISION_SUBJECTS,
    PERMISSIONS.MANAGE_FACULTY,
    PERMISSIONS.MANAGE_CLASSROOMS,
    PERMISSIONS.GENERATE_TIMETABLE,
    PERMISSIONS.EDIT_TIMETABLE,
    PERMISSIONS.VALIDATE_TIMETABLE,
    PERMISSIONS.RESOLVE_CONFLICTS,
    PERMISSIONS.PUBLISH_TIMETABLE,
  ],
  VIEWER: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_DATA,
    PERMISSIONS.VIEW_TIMETABLE,
    PERMISSIONS.VIEW_VERSIONS,
    PERMISSIONS.VIEW_REPORTS,
  ],
};

export function normalizeRole(role) {
  const value = String(role || '')
    .trim()
    .toUpperCase();
  if (value === 'ADMIN' || value === 'ADMINISTRATOR') return 'ADMINISTRATOR';
  if (value === 'SCHEDULER') return 'SCHEDULER';
  if (value === 'VIEWER') return 'VIEWER';
  return null;
}

export function formatRoleLabel(role) {
  return ROLE_LABELS[normalizeRole(role)] || 'Viewer';
}

export function canAccess(role, permission) {
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) return false;
  return (ROLE_PERMISSIONS[normalizedRole] || []).includes(permission);
}

export function resolveUser(request) {
  return {
    id: request.user?.id,
    email: request.user?.email,
    role: normalizeRole(request.user?.role),
  };
}

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    console.warn(`[auth] Missing Bearer token on ${req.method} ${req.originalUrl}`);
    return res.status(401).json(errorResponse('Missing authorization token.', 'UNAUTHORIZED'));
  }

  const token = authHeader.substring(7);

  if (!token) {
    console.warn(`[auth] Empty Bearer token on ${req.method} ${req.originalUrl}`);
    return res.status(401).json(errorResponse('Missing authorization token.', 'UNAUTHORIZED'));
  }

  if (!isSupabaseConfigured) {
    return res.status(503).json(errorResponse('Supabase authentication is not configured.', 'SUPABASE_NOT_CONFIGURED'));
  }

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      const reason = authError?.code || authError?.status || 'invalid or expired token';
      console.warn(`[auth] Rejected Bearer token on ${req.method} ${req.originalUrl}: ${reason}`);
      return res.status(401).json(errorResponse('Invalid or expired token.', 'UNAUTHORIZED'));
    }

    const { data: profile, error: profileError } = await supabase
      .from('app_users')
      .select('id, display_name, role')
      .eq('id', user.id)
      .single();
    if (profileError || !profile) {
      console.warn(`[auth] Authenticated user ${user.id} has no Schedulix profile on ${req.method} ${req.originalUrl}`);
      return res.status(403).json(errorResponse('No Schedulix profile exists for this account.', 'PROFILE_REQUIRED'));
    }

    req.user = { id: user.id, email: user.email, name: profile.display_name, role: normalizeRole(profile.role) };
    return next();
  } catch (error) {
    console.error(`[auth] Unexpected error validating token on ${req.method} ${req.originalUrl}:`, error.message);
    return next(error);
  }
}

export function requireRole(allowedRoles) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req, res, next) => {
    const userRole = normalizeRole(req.user?.role);

    if (!userRole || !roles.some((role) => normalizeRole(role) === userRole)) {
      return res.status(403).json(errorResponse(`Access denied. Required role: ${roles.join(' or ')}.`, 'FORBIDDEN'));
    }

    next();
  };
}

export function requirePermission(permission) {
  return (req, res, next) => {
    const role = normalizeRole(req.user?.role);

    if (!role || !canAccess(role, permission)) {
      return res
        .status(403)
        .json(
          errorResponse(`You do not have permission to ${permission.toLowerCase().replace(/_/g, ' ')}.`, 'FORBIDDEN'),
        );
    }

    next();
  };
}
