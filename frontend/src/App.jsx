import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import logoUrl from './public/image.png';
import { PERMISSIONS, ROLE_LABELS, canAccess, formatRoleLabel, normalizeRole } from './rbac.js';
import { supabase, supabaseConfigured } from './supabase.js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

function friendlyAuthError(error, fallback = 'Unable to complete that request. Please try again.') {
  const message = String(error?.message || '').toLowerCase();
  if (message.includes('invalid login credentials') || message.includes('invalid email or password'))
    return 'Invalid email or password.';
  if (message.includes('already registered') || message.includes('already been registered'))
    return 'This email is already registered. Try logging in.';
  if (message.includes('invalid email') || message.includes('valid email'))
    return 'Please enter a valid email address.';
  if (
    message.includes('password') &&
    (message.includes('weak') || message.includes('at least') || message.includes('characters'))
  )
    return 'Password is too weak. Use at least 6 characters.';
  if (message.includes('confirm') || message.includes('verify your email') || message.includes('email not confirmed'))
    return 'Please verify your email before logging in.';
  if (message.includes('network') || message.includes('fetch')) return 'Unable to connect. Please try again.';
  return fallback;
}

function authHeaders(user) {
  const token = user?.session?.access_token;
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

const dataRequests = new Map();

async function fetchData(path, user) {
  const key = `${path}|${user?.id || 'anon'}`;
  const inFlight = dataRequests.get(key);
  if (inFlight) return inFlight;

  const promise = (async () => {
    const response = await fetch(`${API_URL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(user ? authHeaders(user) : {}),
      },
    });

    if (!response.ok) throw new Error(`Unable to load ${path}`);
    const payload = await response.json();
    return payload.data;
  })().finally(() => dataRequests.delete(key));

  dataRequests.set(key, promise);
  return promise;
}

function Logo({ linked = false, className = '' }) {
  const content = (
    <>
      <img src={logoUrl} alt="Schedulix logo" />
      <span>Schedulix</span>
    </>
  );
  return linked ? (
    <Link to="/" className={`brand ${className}`}>
      {content}
    </Link>
  ) : (
    <div className={`brand ${className}`}>{content}</div>
  );
}

function PasswordInput({ value, onChange, minLength }) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="password-input">
      <input type={visible ? 'text' : 'password'} value={value} onChange={onChange} minLength={minLength} required />
      <button
        type="button"
        className="password-toggle"
        aria-label={visible ? 'Hide password' : 'Show password'}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? '◉' : '◌'}
      </button>
    </span>
  );
}

function ProtectedRoute({ user, permission, children }) {
  if (!user) return <Navigate to="/" replace />;
  if (!canAccess(user.role, permission)) return <Navigate to="/" replace />;
  return children;
}

function LoginPage({ onLogin, notice }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [demoLoading, setDemoLoading] = useState('');
  const demoMode = import.meta.env.VITE_DEMO_MODE === 'true';
  const demoAccounts = [
    ['Administrator', import.meta.env.VITE_DEMO_ADMIN_EMAIL, import.meta.env.VITE_DEMO_ADMIN_PASSWORD],
    ['Scheduler', import.meta.env.VITE_DEMO_SCHEDULER_EMAIL, import.meta.env.VITE_DEMO_SCHEDULER_PASSWORD],
    ['Viewer', import.meta.env.VITE_DEMO_VIEWER_EMAIL, import.meta.env.VITE_DEMO_VIEWER_PASSWORD],
  ].filter(([, demoEmail, demoPassword]) => demoEmail && demoPassword);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);
    if (!supabaseConfigured) {
      setError('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      setSubmitting(false);
      return;
    }
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError(friendlyAuthError(authError, 'Unable to sign in. Please check your details and try again.'));
      setSubmitting(false);
      return;
    }
    try {
      await onLogin(data.session);
      setMessage('Login successful');
    } catch (error) {
      setError(friendlyAuthError(error, 'Unable to load your Schedulix profile.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function demoLogin(demoEmail, demoPassword) {
    setError('');
    setMessage('');
    if (!supabaseConfigured) {
      setError('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      return;
    }
    setDemoLoading(demoEmail);
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: demoEmail,
      password: demoPassword,
    });
    if (authError) {
      setError('Demo account is unavailable. Check the Supabase demo-user setup.');
      setDemoLoading('');
      return;
    }
    try {
      await onLogin(data.session);
    } catch (error) {
      setError(friendlyAuthError(error, 'Unable to load your Schedulix profile.'));
    } finally {
      setDemoLoading('');
    }
  }

  async function resetPassword(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!supabaseConfigured) {
      setError('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      return;
    }
    setResetting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: window.location.origin,
    });
    if (resetError)
      setError(friendlyAuthError(resetError, 'Unable to send the password reset email. Please try again.'));
    else {
      setMessage('Password reset email sent.');
      setShowReset(false);
    }
    setResetting(false);
  }

  return (
    <main className="login-screen">
      <section className="login-panel">
        <Logo className="brand-dark" />
        <p className="eyebrow">Academic scheduling workspace</p>
        <h1>Make every period count.</h1>
        <p className="login-copy">Coordinate people, rooms, and constraints in one calm control room.</p>
        {showReset ? (
          <form onSubmit={resetPassword} className="form-stack">
            <label>
              Email
              <input type="email" value={resetEmail} onChange={(event) => setResetEmail(event.target.value)} required />
            </label>
            <button className="primary-button" type="submit" disabled={resetting}>
              {resetting ? 'Sending...' : 'Send reset email'} {!resetting && <span>→</span>}
            </button>
          </form>
        ) : (
          <form onSubmit={submit} className="form-stack">
            <label>
              Email
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <label>
              Password
              <PasswordInput value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <button className="primary-button" type="submit" disabled={submitting}>
              {submitting ? 'Signing in...' : 'Enter workspace'} {!submitting && <span>→</span>}
            </button>
          </form>
        )}
        {error && <p className="form-error">{error}</p>}
        {notice && <p className="form-error">{notice}</p>}
        {message && <p className="form-success">{message}</p>}
        {!showReset && (
          <button className="text-link auth-switch" type="button" onClick={() => setShowReset(true)}>
            Forgot password?
          </button>
        )}
        {showReset && (
          <button className="text-link auth-switch" type="button" onClick={() => setShowReset(false)}>
            Back to sign in
          </button>
        )}
        {demoMode && demoAccounts.length > 0 && (
          <div className="demo-login">
            <p className="eyebrow">Demo accounts</p>
            {demoAccounts.map(([label, demoEmail, demoPassword]) => (
              <button
                className="secondary-button"
                type="button"
                key={label}
                disabled={Boolean(demoLoading)}
                onClick={() => demoLogin(demoEmail, demoPassword)}
              >
                {demoLoading === demoEmail ? 'Signing in...' : `Login as ${label}`}
              </button>
            ))}
          </div>
        )}
      </section>
      <section className="login-art" aria-label="Scheduling overview">
        <div className="art-note">
          <span className="status-dot" /> System ready
        </div>
        <div className="art-grid">
          <b>MON</b>
          <b>TUE</b>
          <b>WED</b>
          <b>THU</b>
          <span>09:00</span>
          <strong>Java</strong>
          <strong>DBMS</strong>
          <strong>OS</strong>
          <strong>Math</strong>
          <span>10:00</span>
          <strong>Networks</strong>
          <strong>Data Structures</strong>
          <strong>Lab</strong>
          <strong>Free</strong>
        </div>
      </section>
    </main>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [data, setData] = useState({
    departments: [],
    divisions: [],
    subjects: [],
    faculty: [],
    classrooms: [],
    timeSlots: [],
  });
  const [entries, setEntries] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [timetableStatus, setTimetableStatus] = useState('EMPTY');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const profileInFlight = useRef(new Map());
  const signOutInFlight = useRef(false);

  function isAuthFailure(error) {
    return error && error.status === 401;
  }

  async function loadProfile(session) {
    if (!session) {
      setUser(null);
      return null;
    }
    const key = session.user.id;
    const inFlight = profileInFlight.current.get(key);
    if (inFlight) return inFlight;

    const promise = (async () => {
      let response;
      try {
        response = await fetch(`${API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
      } catch (error) {
        const networkError = new Error('Unable to reach the Schedulix backend. Your session was kept.');
        networkError.status = 0;
        throw networkError;
      }
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        const authError = new Error(
          payload.error?.message || 'Your session is invalid or has expired. Please sign in again.',
        );
        authError.status = 401;
        throw authError;
      }
      if (!response.ok) {
        const profileError = new Error(
          payload.error?.message || `Unable to load your Schedulix profile (HTTP ${response.status}).`,
        );
        profileError.status = response.status;
        throw profileError;
      }
      const loadedUser = {
        session,
        id: session.user.id,
        email: session.user.email,
        role: normalizeRole(payload.data?.user?.role),
      };
      setUser(loadedUser);
      return loadedUser;
    })().finally(() => profileInFlight.current.delete(key));

    profileInFlight.current.set(key, promise);
    return promise;
  }

  async function clearAuthState() {
    if (signOutInFlight.current) return;
    signOutInFlight.current = true;
    try {
      if (supabase) {
        try {
          await supabase.auth.signOut();
        } catch (error) {
          console.warn('Sign out from Supabase failed:', error.message);
        }
      }
      setUser(null);
      setData({ departments: [], divisions: [], subjects: [], faculty: [], classrooms: [], timeSlots: [] });
      setEntries([]);
      setConflicts([]);
      setTimetableStatus('EMPTY');
      setNotice('');
    } finally {
      signOutInFlight.current = false;
    }
  }

  async function restoreProfile(session) {
    if (!session) {
      setUser(null);
      setNotice('');
      setAuthLoading(false);
      return;
    }
    try {
      await loadProfile(session);
      setNotice('');
      setAuthLoading(false);
    } catch (error) {
      setAuthLoading(false);
      if (isAuthFailure(error)) {
        await clearAuthState();
      } else {
        setUser(null);
        setNotice(
          error.status === 0
            ? 'Your session is still valid, but the Schedulix backend could not be reached. Try again in a moment.'
            : error.message,
        );
      }
    }
  }

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    Promise.all([
      ...['departments', 'divisions', 'subjects', 'faculty', 'classrooms', 'time-slots'].map((name) =>
        fetchData(`/${name}`, user),
      ),
      fetchData('/timetable/current', user),
    ])
      .then(([departments, divisions, subjects, faculty, classrooms, timeSlots, current]) => {
        setData({ departments, divisions, subjects, faculty, classrooms, timeSlots });
        setEntries(current.entries || []);
        setTimetableStatus(current.version?.status?.toUpperCase() || (current.entries?.length ? 'DRAFT' : 'EMPTY'));
      })
      .catch((error) => setNotice(`${error.message}. Start the backend on port 4000.`))
      .finally(() => setLoading(false));
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return undefined;
    }
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) return restoreProfile(session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) return restoreProfile(session);
    });
    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function login(session) {
    try {
      await loadProfile(session);
    } catch (error) {
      if (isAuthFailure(error)) await clearAuthState();
      throw error;
    }
  }

  async function logout() {
    if (logoutLoading) return;
    setLogoutLoading(true);
    try {
      if (supabase) await supabase.auth.signOut();
      setUser(null);
      setData({ departments: [], divisions: [], subjects: [], faculty: [], classrooms: [], timeSlots: [] });
      setEntries([]);
      setConflicts([]);
      setTimetableStatus('EMPTY');
      setNotice('');
    } finally {
      setLogoutLoading(false);
    }
  }

  if (authLoading) return <div className="loading-screen">Loading Schedulix...</div>;
  if (!user) return <LoginPage onLogin={login} notice={notice} />;
  if (loading) return <div className="loading-screen">Loading Schedulix workspace...</div>;

  return (
    <Workspace
      user={user}
      data={data}
      setData={setData}
      entries={entries}
      setEntries={setEntries}
      conflicts={conflicts}
      setConflicts={setConflicts}
      timetableStatus={timetableStatus}
      setTimetableStatus={setTimetableStatus}
      notice={notice}
      setNotice={setNotice}
      onLogout={logout}
      logoutLoading={logoutLoading}
    />
  );
}

function Workspace({
  user,
  data,
  setData,
  entries,
  setEntries,
  conflicts,
  setConflicts,
  timetableStatus,
  setTimetableStatus,
  notice,
  setNotice,
  onLogout,
  logoutLoading,
}) {
  const can = (permission) => canAccess(user.role, permission);
  const navItems = [
    { to: '/', label: 'Dashboard', icon: '⌂', permission: PERMISSIONS.VIEW_DASHBOARD },
    { to: '/departments', label: 'Departments', icon: '▦', permission: PERMISSIONS.VIEW_DATA },
    { to: '/divisions', label: 'Divisions', icon: '◫', permission: PERMISSIONS.VIEW_DATA },
    { to: '/subjects', label: 'Subjects', icon: '◈', permission: PERMISSIONS.VIEW_DATA },
    {
      to: '/division-subjects',
      label: 'Division subjects',
      icon: '⊞',
      permission: PERMISSIONS.MANAGE_DIVISION_SUBJECTS,
    },
    {
      to: '/subject-requirements',
      label: 'Subject requirements',
      icon: '⊙',
      permission: PERMISSIONS.MANAGE_REQUIREMENTS,
    },
    { to: '/faculty', label: 'Faculty', icon: '♧', permission: PERMISSIONS.VIEW_DATA },
    { to: '/classrooms', label: 'Classrooms', icon: '□', permission: PERMISSIONS.VIEW_DATA },
    { to: '/availability', label: 'Availability', icon: '◷', permission: PERMISSIONS.MANAGE_AVAILABILITY },
    { to: '/generate', label: 'Generate Timetable', icon: '✦', permission: PERMISSIONS.GENERATE_TIMETABLE },
    { to: '/timetable', label: 'Timetable', icon: '▣', permission: PERMISSIONS.VIEW_TIMETABLE },
    { to: '/reports', label: 'Reports', icon: '▤', permission: PERMISSIONS.VIEW_REPORTS },
    { to: '/users', label: 'Users', icon: '◎', permission: PERMISSIONS.MANAGE_USERS },
    { to: '/audit-logs', label: 'Audit Logs', icon: '◍', permission: PERMISSIONS.VIEW_AUDIT_LOGS },
  ].filter((item) => !item.permission || can(item.permission));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Logo linked />
        <p className="sidebar-caption">Timetable operations</p>
        <nav>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className="nav-link">
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {can(PERMISSIONS.GENERATE_TIMETABLE) && (
            <NavLink to="/generate" className="generate-link">
              <span>✦</span> Generate timetable
            </NavLink>
          )}
          <button className="user-chip" onClick={onLogout} disabled={logoutLoading}>
            <span className="avatar">{user.email[0].toUpperCase()}</span>
            <span>
              <b>{user.email.split('@')[0]}</b>
              <small>{logoutLoading ? 'Signing out...' : formatRoleLabel(user.role)}</small>
            </span>
            <span>↪</span>
          </button>
        </div>
      </aside>
      <main className="content">
        <header className="topbar">
          <div className="workspace-mark">
            <img src={logoUrl} alt="Schedulix logo" />
            <span>
              <b>Schedulix</b>
              <span className="breadcrumb"> / Workspace</span>
            </span>
          </div>
          <span className="role-badge">{formatRoleLabel(user.role)} access</span>
        </header>
        {notice && (
          <div className="notice">
            {notice}
            <button onClick={() => setNotice('')}>×</button>
          </div>
        )}
        <Routes>
          <Route
            path="/"
            element={
              <DashboardPage data={data} entries={entries} conflicts={conflicts} timetableStatus={timetableStatus} />
            }
          />
          <Route
            path="/generate"
            element={
              <ProtectedRoute user={user} permission={PERMISSIONS.GENERATE_TIMETABLE}>
                <GeneratePage
                  user={user}
                  data={data}
                  setEntries={setEntries}
                  setConflicts={setConflicts}
                  setTimetableStatus={setTimetableStatus}
                  setNotice={setNotice}
                />
              </ProtectedRoute>
            }
          />
          <Route
            path="/timetable"
            element={
              <ProtectedRoute user={user} permission={PERMISSIONS.VIEW_TIMETABLE}>
                <TimetablePage
                  user={user}
                  data={data}
                  entries={entries}
                  setEntries={setEntries}
                  canEdit={can(PERMISSIONS.EDIT_TIMETABLE)}
                  setNotice={setNotice}
                />
              </ProtectedRoute>
            }
          />
          <Route
            path="/versions"
            element={
              <ProtectedRoute user={user} permission={PERMISSIONS.VIEW_VERSIONS}>
                <VersionsPage user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute user={user} permission={PERMISSIONS.VIEW_REPORTS}>
                <ReportsPage data={data} entries={entries} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/availability"
            element={
              <ProtectedRoute user={user} permission={PERMISSIONS.MANAGE_AVAILABILITY}>
                <AvailabilityPage user={user} data={data} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/division-subjects"
            element={
              <ProtectedRoute user={user} permission={PERMISSIONS.MANAGE_DIVISION_SUBJECTS}>
                <DivisionSubjectsPage user={user} data={data} setNotice={setNotice} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/subject-requirements"
            element={
              <ProtectedRoute user={user} permission={PERMISSIONS.MANAGE_REQUIREMENTS}>
                <SubjectRequirementsPage user={user} data={data} setNotice={setNotice} />
              </ProtectedRoute>
            }
          />
          {['departments', 'divisions', 'subjects', 'faculty', 'classrooms'].map((name) => (
            <Route
              key={name}
              path={`/${name}`}
              element={
                <ProtectedRoute user={user} permission={PERMISSIONS.VIEW_DATA}>
                  <DataPage
                    name={name}
                    data={data}
                    setData={setData}
                    user={user}
                    canEdit={
                      can(PERMISSIONS.MANAGE_DEPARTMENTS) ||
                      can(PERMISSIONS.MANAGE_DIVISIONS) ||
                      can(PERMISSIONS.MANAGE_SUBJECTS) ||
                      can(PERMISSIONS.MANAGE_FACULTY) ||
                      can(PERMISSIONS.MANAGE_CLASSROOMS)
                    }
                    setNotice={setNotice}
                  />
                </ProtectedRoute>
              }
            />
          ))}
          <Route
            path="/users"
            element={
              <ProtectedRoute user={user} permission={PERMISSIONS.MANAGE_USERS}>
                <UsersPage user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/audit-logs"
            element={
              <ProtectedRoute user={user} permission={PERMISSIONS.VIEW_AUDIT_LOGS}>
                <AuditLogsPage user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute user={user} permission={PERMISSIONS.MANAGE_SETTINGS}>
                <SettingsPage user={user} />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<DashboardPage data={data} entries={entries} conflicts={conflicts} />} />
        </Routes>
      </main>
    </div>
  );
}

function PageHeading({ eyebrow, title, description, action }) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function DashboardPage({ data, entries, conflicts, timetableStatus }) {
  const cards = [
    ['Departments', data.departments.length, 'Configured academic units'],
    ['Divisions', data.divisions.length, 'Student groups'],
    ['Faculty', data.faculty.length, 'Teaching staff'],
    ['Subjects', data.subjects.length, 'Curriculum items'],
    ['Classrooms', data.classrooms.length, 'Rooms and labs'],
    ['Scheduled sessions', entries.length || '—', entries.length ? 'From current version' : 'No timetable yet'],
  ];
  const statusClass = timetableStatus === 'PUBLISHED' ? 'success' : timetableStatus === 'EMPTY' ? 'pending' : 'muted';
  return (
    <>
      <PageHeading
        eyebrow="Overview"
        title="Good morning, scheduler."
        description="A clear view of the constraints that shape this week."
        action={
          <Link className="primary-button compact" to="/generate">
            Generate timetable <span>→</span>
          </Link>
        }
      />
      <div className="stats-grid">
        {cards.map(([title, value, detail]) => (
          <div className="stat-card" key={title}>
            <div className="stat-title">{title}</div>
            <div className="stat-value">{value}</div>
            <p>{detail}</p>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Pipeline</p>
              <h2>Generation status</h2>
            </div>
            <span className={`state-pill ${statusClass}`}>{timetableStatus}</span>
          </div>
          <div className="pipeline">
            <span className="done">
              01 <b>Configure</b>
            </span>
            <i />
            <span className={entries.length ? 'done' : ''}>
              02 <b>Generate</b>
            </span>
            <i />
            <span className={entries.length && !conflicts.length ? 'done' : ''}>
              03 <b>Validate</b>
            </span>
            <i />
            <span className={timetableStatus === 'PUBLISHED' ? 'done' : ''}>
              04 <b>Publish</b>
            </span>
          </div>
        </section>
        <section className="panel conflict-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Attention</p>
              <h2>Conflicts</h2>
            </div>
            <strong className="conflict-number">{conflicts.length}</strong>
          </div>
          <p>
            {conflicts.length
              ? 'Generation needs your attention.'
              : 'No unresolved conflicts in the current timetable.'}
          </p>
          <Link to="/generate" className="text-link">
            Open generation result →
          </Link>
        </section>
      </div>
    </>
  );
}

function GeneratePage({ user, data, setEntries, setConflicts, setTimetableStatus, setNotice }) {
  const [departmentId, setDepartmentId] = useState(data.departments[0]?.id || '');
  const [divisionId, setDivisionId] = useState(data.divisions[0]?.id || '');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [version, setVersion] = useState(null);
  const [generatedEntries, setGeneratedEntries] = useState([]);
  const selectedDivisions = data.divisions.filter(
    (division) => !departmentId || division.departmentId === departmentId,
  );
  useEffect(() => {
    if (selectedDivisions[0] && !selectedDivisions.some((division) => division.id === divisionId))
      setDivisionId(selectedDivisions[0].id);
  }, [departmentId]);

  async function generate(event) {
    event.preventDefault();
    setGenerating(true);
    setResult(null);
    setConflicts([]);
    try {
      const response = await fetch(`${API_URL}/timetable/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(user) },
        body: JSON.stringify({ departmentId, divisionId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || 'Generation failed');
      const generated = payload.data;
      setGeneratedEntries(generated.entries || []);
      setEntries(generated.entries || []);
      setTimetableStatus(generated.status);
      if (generated.status === 'INCOMPLETE') {
        setConflicts(generated.conflicts || []);
        setResult({
          success: false,
          incomplete: true,
          message: 'The timetable could not be fully generated.',
          conflicts: generated.conflicts || [],
          summary: generated.summary,
        });
        return;
      }
      const validationResponse = await fetch(`${API_URL}/timetable/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(user) },
        body: JSON.stringify({ entries: generated.entries }),
      });
      const validationPayload = await validationResponse.json();
      if (!validationResponse.ok || !validationPayload.data?.valid) {
        setConflicts(validationPayload.data?.conflicts || []);
        setResult({
          success: false,
          message: 'Generated entries failed independent validation.',
          conflicts: validationPayload.data?.conflicts || [],
        });
        return;
      }
      setResult({ success: true, summary: generated.summary });
    } catch (error) {
      setResult({ success: false, message: error.message });
      setNotice('The generator could not complete. Review the details below.');
    } finally {
      setGenerating(false);
    }
  }
  async function saveDraft() {
    const response = await fetch(`${API_URL}/timetable/drafts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(user) },
      body: JSON.stringify({ entries: generatedEntries }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setNotice(payload.error?.message || 'Draft could not be saved.');
      return;
    }
    setVersion(payload.data.version);
    setEntries(payload.data.entries);
    setTimetableStatus('DRAFT');
    setNotice('Validated timetable saved as a draft.');
  }
  async function publish() {
    if (!version) return;
    const response = await fetch(`${API_URL}/timetable/publish/${version.id}`, {
      method: 'POST',
      headers: authHeaders(user),
    });
    const payload = await response.json();
    if (response.ok) setTimetableStatus('PUBLISHED');
    setNotice(response.ok ? 'Timetable published.' : payload.error?.message || 'Publish failed.');
  }
  return (
    <>
      <PageHeading
        eyebrow="Main workflow"
        title="Generate timetable"
        description="Choose the scope, then let the constraint engine find the strongest available schedule."
      />
      <div className="generate-layout">
        <form className="panel generate-form" onSubmit={generate}>
          <div className="form-field">
            <label>
              Department
              <select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
                {data.departments.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-field">
            <label>
              Academic year
              <select defaultValue="2026-27">
                <option>2026-27</option>
                <option>2027-28</option>
              </select>
            </label>
          </div>
          <div className="form-field">
            <label>
              Division
              <select value={divisionId} onChange={(event) => setDivisionId(event.target.value)}>
                {selectedDivisions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button className="primary-button generate-button" disabled={generating}>
            {generating ? 'Generating timetable...' : 'Generate timetable'} {!generating && <span>✦</span>}
          </button>
        </form>
        <section className="panel generation-panel">
          <p className="eyebrow">Constraint engine</p>
          <h2>
            {generating
              ? 'Checking constraints...'
              : result?.incomplete
                ? 'Incomplete timetable'
                : result?.success
                  ? 'Ready to review'
                  : 'Ready to generate'}
          </h2>
          {generating ? (
            <div className="check-list">
              <div className="checked">
                <span>…</span>Checking constraints and assigning sessions...
              </div>
            </div>
          ) : result?.incomplete ? (
            <div className="empty-state">
              <span className="empty-icon">!</span>
              <p>
                {result.summary.generated} / {result.summary.required} sessions scheduled.
              </p>
            </div>
          ) : (
            <div className="empty-state">
              <span className="empty-icon">◷</span>
              <p>The generator will validate hard constraints before a draft is created.</p>
            </div>
          )}
        </section>
      </div>
      {result && <ResultPanel result={result} onSaveDraft={saveDraft} onPublish={publish} version={version} />}
    </>
  );
}
function ResultPanel({ result, onSaveDraft, onPublish, version }) {
  return (
    <section className={`result-panel ${result.success ? 'result-success' : 'result-failure'}`}>
      <div className="result-icon">{result.success ? '✓' : '!'}</div>
      <div className="result-copy">
        <p className="eyebrow">Generation result</p>
        <h2>
          {result.success
            ? 'Timetable generated successfully'
            : result.incomplete
              ? 'Timetable could not be fully generated'
              : 'Timetable validation failed'}
        </h2>
        {result.success ? (
          <p>
            {result.summary.generated} sessions scheduled with {result.summary.conflicts} conflicts.
          </p>
        ) : result.incomplete ? (
          <>
            <p>
              {result.summary.generated} / {result.summary.required} sessions scheduled.{' '}
              {result.summary.required - result.summary.generated} sessions could not be assigned.
            </p>
            <ul>
              {(result.conflicts || [])
                .flatMap((conflict) => conflict.reasons || [{ message: conflict.message }])
                .slice(0, 5)
                .map((reason, index) => (
                  <li key={`${reason.type || 'reason'}-${index}`}>{reason.message}</li>
                ))}
            </ul>
          </>
        ) : (
          <>
            <p>{result.message}</p>
            <ul>
              {(result.conflicts || []).slice(0, 5).map((conflict, index) => (
                <li key={`${conflict.type}-${index}`}>{conflict.message}</li>
              ))}
            </ul>
          </>
        )}
      </div>
      <div className="result-actions">
        {result.success && !version && (
          <button className="primary-button" onClick={onSaveDraft}>
            Save draft
          </button>
        )}
        {version && (
          <button className="primary-button" onClick={onPublish}>
            Publish timetable
          </button>
        )}
        <Link to="/timetable" className="secondary-button">
          View timetable
        </Link>
      </div>
    </section>
  );
}
function TimetablePage({ user, data, entries, setEntries, canEdit, setNotice }) {
  const [divisionId, setDivisionId] = useState(data.divisions[0]?.id || '');
  const [editing, setEditing] = useState(null);
  const selectedEntries = entries.filter((entry) => !divisionId || entry.divisionId === divisionId);
  const slots = data.timeSlots.filter((slot) => slot.period <= 5);
  const periods = [...new Set(slots.map((slot) => slot.period))];
  const lookup = (day, period) =>
    selectedEntries.find(
      (entry) =>
        data.timeSlots.find((slot) => slot.id === entry.timeSlotId)?.day === day &&
        data.timeSlots.find((slot) => slot.id === entry.timeSlotId)?.period === period,
    );
  async function saveEdit(nextEntry) {
    if (!editing.versionId) {
      setNotice('Save the generated timetable as a draft before editing it.');
      return;
    }
    const response = await fetch(`${API_URL}/timetable/entries/${editing.versionId}/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders(user) },
      body: JSON.stringify(nextEntry),
    });
    const payload = await response.json();
    if (!response.ok) {
      setNotice(payload.error?.message || 'Edit rejected because it creates conflicts.');
      return;
    }
    setEntries(entries.map((item) => (item.id === editing.id ? payload.data : item)));
    setEditing(null);
    setNotice('Validated timetable edit saved.');
  }
  return (
    <>
      <PageHeading
        eyebrow="Draft schedule"
        title="Timetable view"
        description="Scan the week, then open any session to validate a move."
        action={
          <div className="view-controls">
            <label>
              View
              <select defaultValue="Division">
                <option>Division</option>
                <option>Faculty</option>
                <option>Classroom</option>
              </select>
            </label>
            <label>
              Division
              <select value={divisionId} onChange={(event) => setDivisionId(event.target.value)}>
                {data.divisions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        }
      />
      <section className="panel timetable-wrap">
        {entries.length ? (
          <table className="timetable">
            <thead>
              <tr>
                <th>Day</th>
                {periods.map((period) => (
                  <th key={period}>
                    P{period}
                    <small>{slots.find((slot) => slot.period === period)?.startTime}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr key={day}>
                  <th>{day.slice(0, 3).toUpperCase()}</th>
                  {periods.map((period) => {
                    const entry = lookup(day, period);
                    return (
                      <td key={`${day}-${period}`}>
                        {entry ? (
                          <button className="session-cell" onClick={() => canEdit && setEditing(entry)}>
                            <b>{data.subjects.find((item) => item.id === entry.subjectId)?.name}</b>
                            <small>{data.faculty.find((item) => item.id === entry.facultyId)?.name}</small>
                            <small>{data.classrooms.find((item) => item.id === entry.roomId)?.name}</small>
                          </button>
                        ) : (
                          <span className="free-cell">Free</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyLink text="Generate a draft timetable to populate this view." href="/generate" />
        )}
      </section>
      {editing && <EditSession entry={editing} data={data} onClose={() => setEditing(null)} onSave={saveEdit} />}
    </>
  );
}
function EditSession({ entry, data, onClose, onSave }) {
  const [timeSlotId, setTimeSlotId] = useState(entry.timeSlotId);
  const [facultyId, setFacultyId] = useState(entry.facultyId);
  const [roomId, setRoomId] = useState(entry.roomId);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <button className="close-button" onClick={onClose}>
          ×
        </button>
        <p className="eyebrow">Manual edit</p>
        <h2>{data.subjects.find((item) => item.id === entry.subjectId)?.name}</h2>
        <div className="form-stack">
          <label>
            Time slot
            <select value={timeSlotId} onChange={(event) => setTimeSlotId(event.target.value)}>
              {data.timeSlots.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Faculty
            <select value={facultyId} onChange={(event) => setFacultyId(event.target.value)}>
              {data.faculty.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Room
            <select value={roomId} onChange={(event) => setRoomId(event.target.value)}>
              {data.classrooms.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" onClick={() => onSave({ ...entry, timeSlotId, facultyId, roomId })}>
            Validate and save
          </button>
        </div>
      </div>
    </div>
  );
}
function DataPage({ name, data, setData, user, canEdit, setNotice }) {
  const items = data[name] || [];
  const labels = {
    departments: ['Department', 'name', 'code'],
    divisions: ['Division', 'name', 'studentCount'],
    subjects: ['Subject', 'name', 'requiredSessions'],
    faculty: ['Faculty', 'name', 'qualifications'],
    classrooms: ['Classroom', 'name', 'capacity'],
  };
  const [label, key, secondary] = labels[name];
  const [showCreate, setShowCreate] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [genericForm, setGenericForm] = useState({});
  const [genericSaving, setGenericSaving] = useState(false);
  const [departmentName, setDepartmentName] = useState('');
  const [departmentCode, setDepartmentCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function createDepartment(event) {
    event.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/departments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(user) },
        body: JSON.stringify({ name: departmentName, code: departmentCode }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || 'Unable to create department.');
      setData((current) => ({ ...current, departments: [...current.departments, payload.data] }));
      setDepartmentName('');
      setDepartmentCode('');
      setShowCreate(false);
      setNotice('Department created successfully.');
    } catch (error) {
      setFormError(error.message || 'Unable to create department.');
    } finally {
      setSaving(false);
    }
  }

  async function updateDepartment(event) {
    event.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/departments/${editingDepartment.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders(user) },
        body: JSON.stringify({ name: departmentName, code: departmentCode }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || 'Unable to edit department.');
      setData((current) => ({
        ...current,
        departments: current.departments.map((item) => (item.id === payload.data.id ? payload.data : item)),
      }));
      setEditingDepartment(null);
      setNotice('Department updated successfully.');
    } catch (error) {
      setFormError(error.message || 'Unable to edit department.');
    } finally {
      setSaving(false);
    }
  }

  const editableFields = {
    divisions: [
      ['id', 'Division ID', 'text', true],
      ['departmentId', 'Department', 'select', true],
      ['name', 'Division name', 'text', true],
      ['studentCount', 'Student count', 'number', true],
    ],
    subjects: [
      ['id', 'Subject ID', 'text', true],
      ['departmentId', 'Department', 'select', true],
      ['name', 'Subject name', 'text', true],
      ['requiredSessions', 'Required sessions', 'number', true],
      ['roomType', 'Room type', 'roomType', true],
      ['capacity', 'Capacity', 'number', true],
    ],
    faculty: [
      ['id', 'Faculty ID', 'text', true],
      ['departmentId', 'Department', 'select', true],
      ['name', 'Faculty name', 'text', true],
    ],
    classrooms: [
      ['id', 'Room ID', 'text', true],
      ['name', 'Room name', 'text', true],
      ['roomType', 'Room type', 'roomType', true],
      ['capacity', 'Capacity', 'number', true],
    ],
  };

  function openGenericCreate() {
    setFormError('');
    setGenericForm({});
    setEditingItem(null);
    setShowCreate(true);
  }

  function openGenericEdit(item) {
    setFormError('');
    setGenericForm({ ...item });
    setEditingItem(item);
    setShowCreate(true);
  }

  async function saveGeneric(event) {
    event.preventDefault();
    setFormError('');
    setGenericSaving(true);
    const endpoint = name;
    const payload = { ...genericForm };
    if (name === 'divisions') payload.studentCount = Number(payload.studentCount);
    if (name === 'subjects') {
      payload.requiredSessions = Number(payload.requiredSessions);
      payload.capacity = Number(payload.capacity);
    }
    if (name === 'classrooms') payload.capacity = Number(payload.capacity);
    try {
      const response = await fetch(`${API_URL}/${endpoint}${editingItem ? `/${editingItem.id}` : ''}`, {
        method: editingItem ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(user) },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || `Unable to save ${label.toLowerCase()}.`);
      setData((current) => ({
        ...current,
        [name]: editingItem
          ? current[name].map((item) => (item.id === result.data.id ? result.data : item))
          : [...current[name], result.data],
      }));
      setShowCreate(false);
      setNotice(`${label} ${editingItem ? 'updated' : 'created'} successfully.`);
    } catch (error) {
      setFormError(error.message);
    } finally {
      setGenericSaving(false);
    }
  }

  async function deleteGeneric(item) {
    if (!window.confirm(`Are you sure you want to delete this ${label.toLowerCase()}?`)) return;
    try {
      const response = await fetch(`${API_URL}/${name}/${item.id}`, { method: 'DELETE', headers: authHeaders(user) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || `Unable to delete ${label.toLowerCase()}.`);
      setData((current) => ({ ...current, [name]: current[name].filter((entry) => entry.id !== item.id) }));
      setNotice(`${label} deleted successfully.`);
    } catch (error) {
      setNotice(error.message);
    }
  }

  function renderGenericField([field, fieldLabel, type, required]) {
    const value = genericForm[field] ?? '';
    const setValue = (nextValue) => setGenericForm((current) => ({ ...current, [field]: nextValue }));
    if (type === 'select')
      return (
        <label key={field}>
          {fieldLabel}
          <select value={value} onChange={(event) => setValue(event.target.value)} required={required}>
            <option value="">Select department</option>
            {data.departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </label>
      );
    if (type === 'roomType')
      return (
        <label key={field}>
          {fieldLabel}
          <select value={value} onChange={(event) => setValue(event.target.value)} required={required}>
            <option value="">Select room type</option>
            <option value="CLASSROOM">Classroom</option>
            <option value="LAB">Laboratory</option>
          </select>
        </label>
      );
    return (
      <label key={field}>
        {fieldLabel}
        <input
          type={type}
          value={value}
          min={type === 'number' ? 1 : undefined}
          onChange={(event) => setValue(type === 'number' ? event.target.value : event.target.value)}
          required={required}
          disabled={editingItem && field === 'id'}
        />
      </label>
    );
  }

  return (
    <>
      <PageHeading
        eyebrow="Configuration"
        title={label}
        description={`Manage the ${name} used by the scheduling engine.`}
        action={
          canEdit && (
            <button
              className="primary-button compact"
              onClick={() => {
                if (name === 'departments') {
                  setFormError('');
                  setShowCreate(true);
                } else openGenericCreate();
              }}
            >
              + Add {label}
            </button>
          )
        }
      />
      {showCreate && name === 'departments' && (
        <div className="modal-backdrop" onClick={() => !saving && setShowCreate(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-department-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="close-button"
              aria-label="Close"
              onClick={() => setShowCreate(false)}
              disabled={saving}
            >
              ×
            </button>
            <p className="eyebrow">Configuration</p>
            <h2 id="add-department-title">Add department</h2>
            <form onSubmit={createDepartment} className="form-stack">
              <label>
                Department name
                <input
                  value={departmentName}
                  onChange={(event) => setDepartmentName(event.target.value)}
                  required
                  autoFocus
                />
              </label>
              <label>
                Department code
                <input
                  value={departmentCode}
                  onChange={(event) => setDepartmentCode(event.target.value.toUpperCase())}
                  maxLength="20"
                  required
                />
              </label>
              {formError && <p className="form-error">{formError}</p>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowCreate(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={saving}>
                  {saving ? 'Creating...' : 'Create department'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {showCreate && name !== 'departments' && (
        <div className="modal-backdrop" onClick={() => !genericSaving && setShowCreate(false)}>
          <section className="modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="close-button"
              aria-label="Close"
              onClick={() => setShowCreate(false)}
              disabled={genericSaving}
            >
              ×
            </button>
            <p className="eyebrow">Configuration</p>
            <h2>{editingItem ? `Edit ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}</h2>
            <form onSubmit={saveGeneric} className="form-stack">
              {editableFields[name].map(renderGenericField)}
              {formError && <p className="form-error">{formError}</p>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowCreate(false)}
                  disabled={genericSaving}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={genericSaving}>
                  {genericSaving ? 'Saving...' : editingItem ? 'Save changes' : `Create ${label.toLowerCase()}`}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {editingDepartment && name === 'departments' && (
        <div className="modal-backdrop" onClick={() => !saving && setEditingDepartment(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-department-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="close-button"
              aria-label="Close"
              onClick={() => setEditingDepartment(null)}
              disabled={saving}
            >
              ×
            </button>
            <p className="eyebrow">Configuration</p>
            <h2 id="edit-department-title">Edit department</h2>
            <form onSubmit={updateDepartment} className="form-stack">
              <label>
                Department name
                <input
                  value={departmentName}
                  onChange={(event) => setDepartmentName(event.target.value)}
                  required
                  autoFocus
                />
              </label>
              <label>
                Department code
                <input
                  value={departmentCode}
                  onChange={(event) => setDepartmentCode(event.target.value.toUpperCase())}
                  maxLength="20"
                  required
                />
              </label>
              {formError && <p className="form-error">{formError}</p>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setEditingDepartment(null)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={saving}>
                  {saving ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      <section className="panel table-panel">
        <div className="table-toolbar">
          <strong>{items.length} records</strong>
          <input placeholder={`Search ${name}...`} />
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>{label}</th>
              <th>
                {name === 'divisions'
                  ? 'Students'
                  : name === 'faculty'
                    ? 'Can teach'
                    : name === 'subjects'
                      ? 'Sessions / room'
                      : name === 'classrooms'
                        ? 'Capacity / type'
                        : 'Code'}
              </th>
              <th>Status</th>
              {canEdit && <th />}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <b>{item[key]}</b>
                  <small>{item.departmentId || item.id}</small>
                </td>
                <td>
                  {Array.isArray(item[secondary])
                    ? item[secondary].length + ' qualified subjects'
                    : `${item[secondary]}${name === 'subjects' ? ' / ' + item.roomType : ''}`}
                </td>
                <td>
                  <span className="state-pill success">Active</span>
                </td>
                {canEdit && (
                  <td>
                    <button
                      className="icon-button"
                      type="button"
                      title={`Edit ${label}`}
                      aria-label={`Edit ${label}`}
                      onClick={() => {
                        if (name !== 'departments') {
                          openGenericEdit(item);
                          return;
                        }
                        setFormError('');
                        setDepartmentName(item.name);
                        setDepartmentCode(item.code);
                        setEditingDepartment(item);
                      }}
                    >
                      ✎
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      title={`Delete ${label}`}
                      aria-label={`Delete ${label}`}
                      onClick={() => deleteGeneric(item)}
                    >
                      ⌫
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
function AvailabilityPage({ user, data }) {
  const [tab, setTab] = useState('faculty');
  const [facultyAvailability, setFacultyAvailability] = useState([]);
  const [roomAvailability, setRoomAvailability] = useState([]);
  const [selectedFaculty, setSelectedFaculty] = useState(data.faculty[0]?.id || '');
  const [selectedRoom, setSelectedRoom] = useState(data.classrooms[0]?.id || '');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    Promise.all([fetchData('/availability/faculty', user), fetchData('/availability/rooms', user)])
      .then(([facultyRows, roomRows]) => {
        setFacultyAvailability(facultyRows);
        setRoomAvailability(roomRows);
      })
      .catch((error) => setNotice(error.message));
  }, [user?.id]);

  const selectedResource = tab === 'faculty' ? selectedFaculty : selectedRoom;
  const rows = tab === 'faculty' ? facultyAvailability : roomAvailability;
  const isAvailable = (slot) => {
    const row = rows.find(
      (item) =>
        (tab === 'faculty' ? item.faculty_id : item.classroom_id) === selectedResource && item.time_slot_id === slot.id,
    );
    return row?.available ?? true;
  };

  async function toggle(slot) {
    const available = !isAvailable(slot);
    const path = tab === 'faculty' ? '/availability/faculty' : '/availability/rooms';
    const body =
      tab === 'faculty'
        ? { facultyId: selectedResource, timeSlotId: slot.id, available }
        : { classroomId: selectedResource, timeSlotId: slot.id, available };
    try {
      const response = await fetch(`${API_URL}${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders(user) },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || 'Unable to save availability.');
      const setter = tab === 'faculty' ? setFacultyAvailability : setRoomAvailability;
      setter((current) => [
        ...current.filter(
          (item) =>
            !(
              (tab === 'faculty' ? item.faculty_id : item.classroom_id) === selectedResource &&
              item.time_slot_id === slot.id
            ),
        ),
        payload.data,
      ]);
      setNotice('Availability saved.');
    } catch (error) {
      setNotice(error.message);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="Configuration"
        title="Time slots & availability"
        description="Toggle the slots that faculty and classrooms can use."
      />
      <section className="panel">
        <div className="view-controls">
          <button
            type="button"
            className={tab === 'faculty' ? 'primary-button' : 'secondary-button'}
            onClick={() => setTab('faculty')}
          >
            Faculty availability
          </button>
          <button
            type="button"
            className={tab === 'rooms' ? 'primary-button' : 'secondary-button'}
            onClick={() => setTab('rooms')}
          >
            Room availability
          </button>
          <select
            value={selectedResource}
            onChange={(event) =>
              tab === 'faculty' ? setSelectedFaculty(event.target.value) : setSelectedRoom(event.target.value)
            }
          >
            {(tab === 'faculty' ? data.faculty : data.classrooms).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        {notice && <p className="form-success">{notice}</p>}
        <table className="availability-table">
          <thead>
            <tr>
              <th>Day</th>
              {[1, 2, 3, 4, 5].map((period) => (
                <th key={period}>Period {period}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day}>
                <th>{day}</th>
                {[1, 2, 3, 4, 5].map((period) => {
                  const slot = data.timeSlots.find((item) => item.day === day && item.period === period);
                  return (
                    <td key={period}>
                      {slot ? (
                        <button
                          type="button"
                          className={isAvailable(slot) ? 'availability-open' : 'availability-closed'}
                          onClick={() => toggle(slot)}
                        >
                          {isAvailable(slot) ? '✓' : '✕'}
                        </button>
                      ) : (
                        <span className="availability-closed">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
function DivisionSubjectsPage({ user, data, setNotice }) {
  const [divisionId, setDivisionId] = useState(data.divisions[0]?.id || '');
  const [selected, setSelected] = useState([]);
  const division = data.divisions.find((item) => item.id === divisionId);
  const subjects = data.subjects.filter((item) => item.departmentId === division?.departmentId);
  useEffect(() => {
    fetchData('/division-subjects', user)
      .then((mapping) => setSelected((mapping[divisionId] || []).map((item) => item.subjectId || item)))
      .catch(() => setSelected([]));
  }, [divisionId, user?.id]);
  function toggle(subjectId) {
    setSelected((current) =>
      current.includes(subjectId) ? current.filter((id) => id !== subjectId) : [...current, subjectId],
    );
  }
  async function save() {
    const response = await fetch(`${API_URL}/division-subjects/${divisionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders(user) },
      body: JSON.stringify({ subjectIds: selected }),
    });
    const payload = await response.json();
    setNotice(
      response.ok ? 'Division subject assignments saved.' : payload.error?.message || 'Unable to save assignments.',
    );
  }
  return (
    <>
      <PageHeading
        eyebrow="Configuration"
        title="Division subject assignment"
        description="Choose exactly which subjects each division must schedule."
        action={
          <button className="primary-button compact" onClick={save}>
            Save assignments
          </button>
        }
      />
      <section className="panel form-stack">
        <label>
          Division
          <select value={divisionId} onChange={(event) => setDivisionId(event.target.value)}>
            {data.divisions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <div className="check-grid">
          {subjects.map((subject) => (
            <label className="check-row" key={subject.id}>
              <input type="checkbox" checked={selected.includes(subject.id)} onChange={() => toggle(subject.id)} />
              <span>
                <b>{subject.name}</b>
                <small>{subject.requiredSessions} sessions / week</small>
              </span>
            </label>
          ))}
        </div>
      </section>
    </>
  );
}
function SubjectRequirementsPage({ user, data, setNotice }) {
  const [divisionId, setDivisionId] = useState(data.divisions[0]?.id || '');
  const [subjectId, setSubjectId] = useState(data.subjects[0]?.id || '');
  const [saving, setSaving] = useState(false);
  const subject = data.subjects.find((item) => item.id === subjectId);
  const division = data.divisions.find((item) => item.id === divisionId);
  const availableSubjects = data.subjects.filter((item) => !division || item.departmentId === division.departmentId);
  const [roomType, setRoomType] = useState(subject?.roomType || 'CLASSROOM');
  const [seats, setSeats] = useState(subject?.capacity || 1);
  useEffect(() => {
    if (availableSubjects[0] && !availableSubjects.some((item) => item.id === subjectId))
      setSubjectId(availableSubjects[0].id);
  }, [divisionId, data.subjects.length]);
  useEffect(() => {
    setRoomType(subject?.roomType || 'CLASSROOM');
    setSeats(subject?.capacity || 1);
  }, [subjectId]);
  async function save(event) {
    event.preventDefault();
    if (!divisionId || !subjectId || Number(seats) < 1) {
      setNotice('Choose a division, subject, and valid minimum seat count.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/subject-requirements/${subjectId}/${divisionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders(user) },
        body: JSON.stringify({ requiredRoomType: roomType, requiredSeats: Number(seats) }),
      });
      const payload = await response.json();
      setNotice(response.ok ? 'Subject requirement saved.' : payload.error?.message || 'Unable to save requirement.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="Configuration"
        title="Subject requirements"
        description="Set the room type and minimum capacity required for each division-subject pair."
      />
      <form className="generate-layout" onSubmit={save}>
        <section className="panel form-stack">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Requirement rule</p>
              <h2>Choose a division-subject pair</h2>
            </div>
            <span className="state-pill pending">Draft</span>
          </div>
          <label>
            Division
            <select value={divisionId} onChange={(event) => setDivisionId(event.target.value)} required>
              <option value="">Select a division</option>
              {data.divisions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Subject
            <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} required>
              <option value="">Select a subject</option>
              {availableSubjects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <p className="page-description">
            These constraints are applied before the timetable generator assigns a room.
          </p>
        </section>
        <section className="panel form-stack">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Room constraints</p>
              <h2>Define the minimum standard</h2>
            </div>
            <span className="state-pill success">Required</span>
          </div>
          <label>
            Required room type
            <select value={roomType} onChange={(event) => setRoomType(event.target.value)}>
              <option value="CLASSROOM">Classroom</option>
              <option value="LAB">Laboratory</option>
            </select>
          </label>
          <label>
            Minimum seats
            <input
              type="number"
              min="1"
              step="1"
              value={seats}
              onChange={(event) => setSeats(event.target.value)}
              required
            />
          </label>
          <p className="page-description">
            Rooms below this capacity or with the wrong type will be rejected as hard constraint conflicts.
          </p>
          <button
            className="primary-button"
            type="submit"
            disabled={saving || !data.divisions.length || !data.subjects.length}
          >
            {saving ? 'Saving requirement...' : 'Save requirement'} {!saving && <span>→</span>}
          </button>
        </section>
      </form>
      {(!data.divisions.length || !data.subjects.length) && (
        <section className="panel empty-state">
          <span className="empty-icon">◌</span>
          <p>Add at least one division and subject before defining requirements.</p>
        </section>
      )}
    </>
  );
}
function VersionsPage({ user }) {
  const [versions, setVersions] = useState(null);
  useEffect(() => {
    fetchData('/timetable/versions', user)
      .then(setVersions)
      .catch(() => setVersions([]));
  }, [user?.id]);
  return (
    <>
      <PageHeading
        eyebrow="Audit trail"
        title="Timetable versions"
        description="Every generated draft gets a clear place in the publishing history."
        action={<button className="secondary-button">Export history ↓</button>}
      />
      <section className="panel table-panel">
        {versions === null ? (
          <div className="empty-state">
            <span className="empty-icon">◷</span>
            <p>Loading timetable history...</p>
          </div>
        ) : versions.length ? (
          <table className="data-table versions-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Created</th>
                <th>Status</th>
                <th>Sessions</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((version) => (
                <tr key={version.id}>
                  <td>
                    <b>v{version.version_number}</b>
                    <small>{version.name}</small>
                  </td>
                  <td>{new Date(version.created_at).toLocaleDateString()}</td>
                  <td>
                    <span
                      className={`state-pill ${version.status === 'published' ? 'success' : version.status === 'draft' ? 'pending' : 'muted'}`}
                    >
                      {version.status}
                    </span>
                  </td>
                  <td>{version.session_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <span className="empty-icon">◌</span>
            <p>No timetable versions have been saved yet.</p>
          </div>
        )}
      </section>
    </>
  );
}
function ReportsPage({ data, entries }) {
  const [activeReport, setActiveReport] = useState(null);
  const reportDetails = {
    'Faculty timetable': data.faculty.map(
      (faculty) => `${faculty.name}: ${entries.filter((entry) => entry.facultyId === faculty.id).length} sessions`,
    ),
    'Division timetable': data.divisions.map(
      (division) => `${division.name}: ${entries.filter((entry) => entry.divisionId === division.id).length} sessions`,
    ),
    'Classroom utilization': data.classrooms.map(
      (room) => `${room.name}: ${entries.filter((entry) => entry.roomId === room.id).length} sessions`,
    ),
    'Conflict report': entries.length
      ? ['No conflicts in the current generated timetable.']
      : ['No timetable has been generated yet.'],
  };
  return (
    <>
      <PageHeading
        eyebrow="Reports"
        title="Scheduling reports"
        description="Simple operational views for sharing and review."
      />
      <div className="report-grid">
        {[
          ['Faculty timetable', `${data.faculty.length} teaching profiles`],
          ['Division timetable', `${data.divisions.length} student groups`],
          ['Classroom utilization', `${data.classrooms.length} rooms tracked`],
          ['Conflict report', `${entries.length ? 0 : '—'} unresolved conflicts`],
        ].map(([title, detail]) => (
          <section className="panel report-card" key={title}>
            <span className="report-mark">▤</span>
            <h2>{title}</h2>
            <p>{detail}</p>
            <button className="text-link" type="button" onClick={() => setActiveReport(title)}>
              View report →
            </button>
          </section>
        ))}
      </div>
      {activeReport && (
        <div className="modal-backdrop" onClick={() => setActiveReport(null)}>
          <section className="modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="close-button"
              aria-label="Close report"
              onClick={() => setActiveReport(null)}
            >
              ×
            </button>
            <p className="eyebrow">Report</p>
            <h2>{activeReport}</h2>
            <ul className="report-details">
              {reportDetails[activeReport].map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </>
  );
}
function UsersPage({ user }) {
  const [users, setUsers] = useState([]);
  const [savingId, setSavingId] = useState('');
  const [notice, setNotice] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [invite, setInvite] = useState({ displayName: '', email: '', role: 'VIEWER' });
  const [inviting, setInviting] = useState(false);
  const canManageRoles = canAccess(user.role, PERMISSIONS.MANAGE_ROLES);
  useEffect(() => {
    fetchData('/users', user)
      .then((items) => setUsers(items))
      .catch(() => setUsers([]));
  }, [user?.id]);

  async function updateRole(id, role) {
    setSavingId(id);
    setNotice('');
    try {
      const response = await fetch(`${API_URL}/users/${id}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders(user) },
        body: JSON.stringify({ role }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || 'Unable to update role.');
      setUsers((current) => current.map((item) => (item.id === id ? { ...item, ...payload.data } : item)));
      setNotice('User role updated.');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setSavingId('');
    }
  }

  async function inviteUser(event) {
    event.preventDefault();
    setInviting(true);
    setNotice('');
    try {
      const response = await fetch(`${API_URL}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(user) },
        body: JSON.stringify(invite),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || 'Unable to invite user.');
      setUsers((current) => [...current, payload.data]);
      setInvite({ displayName: '', email: '', role: 'VIEWER' });
      setShowInvite(false);
      setNotice('Invitation sent successfully.');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setInviting(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="Administration"
        title="User management"
        description="Control who can create schedules, manage system settings, and view operational data."
        action={
          canManageRoles && (
            <button className="primary-button compact" type="button" onClick={() => setShowInvite(true)}>
              + Add user
            </button>
          )
        }
      />
      {showInvite && (
        <div className="modal-backdrop" onClick={() => !inviting && setShowInvite(false)}>
          <section className="modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="close-button"
              aria-label="Close"
              onClick={() => setShowInvite(false)}
              disabled={inviting}
            >
              ×
            </button>
            <p className="eyebrow">Administration</p>
            <h2>Invite user</h2>
            <form onSubmit={inviteUser} className="form-stack">
              <label>
                Display name
                <input
                  value={invite.displayName}
                  onChange={(event) => setInvite({ ...invite, displayName: event.target.value })}
                  required
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={invite.email}
                  onChange={(event) => setInvite({ ...invite, email: event.target.value })}
                  required
                />
              </label>
              <label>
                Role
                <select value={invite.role} onChange={(event) => setInvite({ ...invite, role: event.target.value })}>
                  <option value="VIEWER">Viewer</option>
                  <option value="SCHEDULER">Scheduler</option>
                  <option value="ADMINISTRATOR">Administrator</option>
                </select>
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowInvite(false)}
                  disabled={inviting}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={inviting}>
                  {inviting ? 'Sending...' : 'Send invitation'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      <section className="panel table-panel">
        {notice && <p className="form-success">{notice}</p>}
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Created At</th>
            </tr>
          </thead>
          <tbody>
            {users.map((item) => (
              <tr key={item.id}>
                <td>
                  <b>{item.display_name}</b>
                </td>
                <td>{item.email}</td>
                <td>
                  {canManageRoles ? (
                    <select
                      value={item.role}
                      onChange={(event) => updateRole(item.id, event.target.value)}
                      disabled={savingId === item.id}
                    >
                      <option value="ADMINISTRATOR">Administrator</option>
                      <option value="SCHEDULER">Scheduler</option>
                      <option value="VIEWER">Viewer</option>
                    </select>
                  ) : (
                    formatRoleLabel(item.role)
                  )}
                </td>
                <td>
                  <span className="state-pill success">Active</span>
                </td>
                <td>{new Date(item.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
function AuditLogsPage({ user }) {
  const [entries, setEntries] = useState([]);
  useEffect(() => {
    fetchData('/audit-logs', user)
      .then(setEntries)
      .catch(() => setEntries([]));
  }, [user?.id]);
  return (
    <>
      <PageHeading
        eyebrow="Security"
        title="Audit logs"
        description="Track important scheduling operations and administrative changes."
      />
      <section className="panel table-panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>Action</th>
              <th>Resource</th>
              <th>User</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((item) => (
              <tr key={item.id}>
                <td>{item.action}</td>
                <td>{item.resource}</td>
                <td>{item.user}</td>
                <td>{item.createdAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function SettingsPage({ user }) {
  const [settings, setSettings] = useState(null);
  useEffect(() => {
    fetchData('/settings', user)
      .then(setSettings)
      .catch(() => setSettings({ appName: 'Schedulix', maintenanceMode: false, defaultRole: 'SCHEDULER' }));
  }, [user?.id]);
  return (
    <>
      <PageHeading
        eyebrow="System"
        title="System settings"
        description="Administrative controls for the scheduling platform."
      />
      <section className="panel table-panel">
        <table className="data-table">
          <tbody>
            <tr>
              <th>Application</th>
              <td>{settings?.appName || 'Schedulix'}</td>
            </tr>
            <tr>
              <th>Maintenance mode</th>
              <td>{settings?.maintenanceMode ? 'Enabled' : 'Disabled'}</td>
            </tr>
            <tr>
              <th>Default role</th>
              <td>{ROLE_LABELS[settings?.defaultRole] || 'Scheduler'}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </>
  );
}
function EmptyLink({ text, href }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">◌</span>
      <p>{text}</p>
      <Link className="secondary-button" to={href}>
        Go there →
      </Link>
    </div>
  );
}
export default App;
