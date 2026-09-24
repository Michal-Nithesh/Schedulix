import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import logoUrl from './public/image.png';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const navItems = [
  { to: '/', label: 'Dashboard', icon: '⌂' },
  { to: '/departments', label: 'Departments', icon: '▦' },
  { to: '/divisions', label: 'Divisions', icon: '◫' },
  { to: '/subjects', label: 'Subjects', icon: '◈' },
  { to: '/faculty', label: 'Faculty', icon: '♧' },
  { to: '/classrooms', label: 'Classrooms', icon: '□' },
  { to: '/availability', label: 'Availability', icon: '◷' },
];

async function fetchData(path) {
  const response = await fetch(`${API_URL}${path}`);
  if (!response.ok) throw new Error(`Unable to load ${path}`);
  const payload = await response.json();
  return payload.data;
}

function Logo({ linked = false, className = '' }) {
  const content = <><img src={logoUrl} alt="Schedulix logo" /><span>Schedulix</span></>;
  return linked
    ? <Link to="/" className={`brand ${className}`}>{content}</Link>
    : <div className={`brand ${className}`}>{content}</div>;
}

function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('admin@schedulix.app');
  const [role, setRole] = useState('admin');

  function submit(event) {
    event.preventDefault();
    onLogin({ email, role });
  }

  return (
    <main className="login-screen">
      <section className="login-panel">
        <Logo className="brand-dark" />
        <p className="eyebrow">Academic scheduling workspace</p>
        <h1>Make every period count.</h1>
        <p className="login-copy">Coordinate people, rooms, and constraints in one calm control room.</p>
        <form onSubmit={submit} className="form-stack">
          <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Password<input type="password" defaultValue="schedulix-demo" required /></label>
          <label>Role<select value={role} onChange={(event) => setRole(event.target.value)}><option value="admin">Administrator</option><option value="scheduler">Scheduler</option><option value="viewer">Viewer</option></select></label>
          <button className="primary-button" type="submit">Enter workspace <span>→</span></button>
        </form>
        <small>Demo access is local. Connect Supabase Auth before production use.</small>
      </section>
      <section className="login-art" aria-label="Scheduling overview">
        <div className="art-note"><span className="status-dot" /> System ready</div>
        <div className="art-grid"><b>MON</b><b>TUE</b><b>WED</b><b>THU</b><span>09:00</span><strong>Java</strong><strong>DBMS</strong><strong>OS</strong><strong>Math</strong><span>10:00</span><strong>Networks</strong><strong>Data Structures</strong><strong>Lab</strong><strong>Free</strong></div>
      </section>
    </main>
  );
}

function App() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('schedulix-user') || 'null'));
  const [data, setData] = useState({ departments: [], divisions: [], subjects: [], faculty: [], classrooms: [], timeSlots: [] });
  const [entries, setEntries] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all(['departments', 'divisions', 'subjects', 'faculty', 'classrooms', 'time-slots'].map((name) => fetchData(`/${name}`)))
      .then(([departments, divisions, subjects, faculty, classrooms, timeSlots]) => setData({ departments, divisions, subjects, faculty, classrooms, timeSlots }))
      .catch((error) => setNotice(`${error.message}. Start the backend on port 4000.`))
      .finally(() => setLoading(false));
  }, [user]);

  function login(nextUser) {
    localStorage.setItem('schedulix-user', JSON.stringify(nextUser));
    setUser(nextUser);
  }

  function logout() {
    localStorage.removeItem('schedulix-user');
    setUser(null);
  }

  if (!user) return <LoginPage onLogin={login} />;
  if (loading) return <div className="loading-screen">Loading Schedulix workspace...</div>;

  return <Workspace user={user} data={data} entries={entries} setEntries={setEntries} conflicts={conflicts} setConflicts={setConflicts} notice={notice} setNotice={setNotice} onLogout={logout} />;
}

function Workspace({ user, data, entries, setEntries, conflicts, setConflicts, notice, setNotice, onLogout }) {
  const canEdit = user.role !== 'viewer';
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Logo linked />
        <p className="sidebar-caption">Timetable operations</p>
        <nav>{navItems.map((item) => <NavLink key={item.to} to={item.to} end={item.to === '/'} className="nav-link"><span>{item.icon}</span>{item.label}</NavLink>)}</nav>
        <div className="sidebar-bottom"><NavLink to="/generate" className="generate-link"><span>✦</span> Generate timetable</NavLink><button className="user-chip" onClick={onLogout}><span className="avatar">{user.email[0].toUpperCase()}</span><span><b>{user.email.split('@')[0]}</b><small>{user.role}</small></span><span>↪</span></button></div>
      </aside>
      <main className="content">
        <header className="topbar"><div className="workspace-mark"><img src={logoUrl} alt="Schedulix logo" /><span><b>Schedulix</b><span className="breadcrumb"> / Workspace</span></span></div><span className="role-badge">{user.role} access</span></header>
        {notice && <div className="notice">{notice}<button onClick={() => setNotice('')}>×</button></div>}
        <Routes>
          <Route path="/" element={<DashboardPage data={data} entries={entries} conflicts={conflicts} />} />
          <Route path="/generate" element={<GeneratePage data={data} setEntries={setEntries} setConflicts={setConflicts} setNotice={setNotice} />} />
          <Route path="/timetable" element={<TimetablePage data={data} entries={entries} setEntries={setEntries} canEdit={canEdit} setNotice={setNotice} />} />
          <Route path="/versions" element={<VersionsPage entries={entries} />} />
          <Route path="/reports" element={<ReportsPage data={data} entries={entries} />} />
          <Route path="/availability" element={<AvailabilityPage data={data} />} />
          {['departments', 'divisions', 'subjects', 'faculty', 'classrooms'].map((name) => <Route key={name} path={`/${name}`} element={<DataPage name={name} data={data} canEdit={canEdit} setNotice={setNotice} />} />)}
          <Route path="*" element={<DashboardPage data={data} entries={entries} conflicts={conflicts} />} />
        </Routes>
      </main>
    </div>
  );
}

function PageHeading({ eyebrow, title, description, action }) { return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{action}</div>; }

function DashboardPage({ data, entries, conflicts }) {
  const cards = [['Departments', data.departments.length, 'Configured academic units'], ['Divisions', data.divisions.length, 'Student groups'], ['Faculty', data.faculty.length, 'Teaching staff'], ['Subjects', data.subjects.length, 'Curriculum items'], ['Classrooms', data.classrooms.length, 'Rooms and labs'], ['Current timetable', entries.length || '—', entries.length ? 'Draft generated' : 'No draft yet']];
  return <><PageHeading eyebrow="Overview" title="Good morning, scheduler." description="A clear view of the constraints that shape this week." action={<Link className="primary-button compact" to="/generate">Generate timetable <span>→</span></Link>} /><div className="stats-grid">{cards.map(([title, value, detail]) => <div className="stat-card" key={title}><div className="stat-title">{title}</div><div className="stat-value">{value}</div><p>{detail}</p></div>)}</div><div className="dashboard-grid"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">Pipeline</p><h2>Generation status</h2></div><span className={`state-pill ${entries.length ? 'success' : 'pending'}`}>{entries.length ? 'Ready to review' : 'Waiting'}</span></div><div className="pipeline"><span className="done">01 <b>Configure</b></span><i /><span className={entries.length ? 'done' : ''}>02 <b>Generate</b></span><i /><span className={entries.length ? 'done' : ''}>03 <b>Validate</b></span><i /><span>04 <b>Publish</b></span></div></section><section className="panel conflict-panel"><div className="panel-heading"><div><p className="eyebrow">Attention</p><h2>Conflicts</h2></div><strong className="conflict-number">{conflicts.length}</strong></div><p>{conflicts.length ? 'Generation needs your attention.' : 'No unresolved conflicts in the current draft.'}</p><Link to="/generate" className="text-link">Open generation result →</Link></section></div></>;
}

function GeneratePage({ data, setEntries, setConflicts, setNotice }) {
  const [departmentId, setDepartmentId] = useState(data.departments[0]?.id || '');
  const [divisionId, setDivisionId] = useState(data.divisions[0]?.id || '');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const selectedDivisions = data.divisions.filter((division) => !departmentId || division.departmentId === departmentId);
  useEffect(() => { if (selectedDivisions[0] && !selectedDivisions.some((division) => division.id === divisionId)) setDivisionId(selectedDivisions[0].id); }, [departmentId]);

  async function generate(event) {
    event.preventDefault();
    setProgress(1); setResult(null);
    try {
      const response = await fetch(`${API_URL}/timetable/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ departmentId, divisionId }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || 'Generation failed');
      setProgress(5); setEntries(payload.data.entries); setConflicts([]); setResult({ success: true, summary: payload.data.summary });
    } catch (error) {
      setProgress(5); setConflicts([]); setResult({ success: false, message: error.message }); setNotice('The generator reported a constraint conflict. Review the details below.');
    }
  }
  const checks = ['Checking faculty conflicts', 'Checking classroom availability', 'Checking division conflicts', 'Checking room requirements', 'Generating timetable'];
  return <><PageHeading eyebrow="Main workflow" title="Generate timetable" description="Choose the scope, then let the constraint engine find the strongest available schedule." /><div className="generate-layout"><form className="panel generate-form" onSubmit={generate}><div className="form-field"><label>Department<select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>{data.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div><div className="form-field"><label>Academic year<select defaultValue="2026-27"><option>2026-27</option><option>2027-28</option></select></label></div><div className="form-field"><label>Division<select value={divisionId} onChange={(event) => setDivisionId(event.target.value)}>{selectedDivisions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div><button className="primary-button generate-button" disabled={progress > 0 && progress < 5}>Generate timetable <span>✦</span></button></form><section className="panel generation-panel"><p className="eyebrow">Constraint engine</p><h2>{progress ? 'Generation complete' : 'Ready to generate'}</h2>{progress ? <div className="check-list">{checks.map((check) => <div key={check} className="checked"><span>✓</span>{check}</div>)}</div> : <div className="empty-state"><span className="empty-icon">◷</span><p>Five hard checks will run before a draft is created.</p></div>}</section></div>{result && <ResultPanel result={result} />}</>;
}
function ResultPanel({ result }) { return <section className={`result-panel ${result.success ? 'result-success' : 'result-failure'}`}><div className="result-icon">{result.success ? '✓' : '!'}</div><div className="result-copy"><p className="eyebrow">Generation result</p><h2>{result.success ? 'Timetable generated successfully' : 'Timetable could not be generated'}</h2>{result.success ? <p>{result.summary.generated} sessions scheduled with zero unresolved conflicts.</p> : <><p>{result.message}</p><ul><li>Check faculty availability for the selected division.</li><li>Review room requirements and capacity.</li></ul></>}</div><div className="result-actions">{result.success && <Link to="/timetable" className="primary-button">View timetable →</Link>}<Link to="/reports" className="secondary-button">View details</Link></div></section>; }
function TimetablePage({ data, entries, setEntries, canEdit, setNotice }) {
  const [divisionId, setDivisionId] = useState(data.divisions[0]?.id || '');
  const [editing, setEditing] = useState(null);
  const selectedEntries = entries.filter((entry) => !divisionId || entry.divisionId === divisionId);
  const slots = data.timeSlots.filter((slot) => slot.period <= 5);
  const periods = [...new Set(slots.map((slot) => slot.period))];
  const lookup = (day, period) => selectedEntries.find((entry) => data.timeSlots.find((slot) => slot.id === entry.timeSlotId)?.day === day && data.timeSlots.find((slot) => slot.id === entry.timeSlotId)?.period === period);
  return <><PageHeading eyebrow="Draft schedule" title="Timetable view" description="Scan the week, then open any session to validate a move." action={<div className="view-controls"><label>View<select defaultValue="Division"><option>Division</option><option>Faculty</option><option>Classroom</option></select></label><label>Division<select value={divisionId} onChange={(event) => setDivisionId(event.target.value)}>{data.divisions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>} /><section className="panel timetable-wrap">{entries.length ? <table className="timetable"><thead><tr><th>Day</th>{periods.map((period) => <th key={period}>P{period}<small>{slots.find((slot) => slot.period === period)?.startTime}</small></th>)}</tr></thead><tbody>{days.map((day) => <tr key={day}><th>{day.slice(0, 3).toUpperCase()}</th>{periods.map((period) => { const entry = lookup(day, period); return <td key={`${day}-${period}`}>{entry ? <button className="session-cell" onClick={() => canEdit && setEditing(entry)}><b>{data.subjects.find((item) => item.id === entry.subjectId)?.name}</b><small>{data.faculty.find((item) => item.id === entry.facultyId)?.name}</small><small>{data.classrooms.find((item) => item.id === entry.roomId)?.name}</small></button> : <span className="free-cell">Free</span>}</td>; })}</tr>)}</tbody></table> : <EmptyLink text="Generate a draft timetable to populate this view." href="/generate" />}</section>{editing && <EditSession entry={editing} data={data} onClose={() => setEditing(null)} onDelete={() => { setEntries(entries.filter((item) => item.id !== editing.id)); setEditing(null); setNotice('Session removed from the draft. Validate before publishing.'); }} />}</>;
}
function EditSession({ entry, data, onClose, onDelete }) { const slot = data.timeSlots.find((item) => item.id === entry.timeSlotId); return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={(event) => event.stopPropagation()}><button className="close-button" onClick={onClose}>×</button><p className="eyebrow">Manual edit</p><h2>{data.subjects.find((item) => item.id === entry.subjectId)?.name}</h2><p className="modal-location">{data.divisions.find((item) => item.id === entry.divisionId)?.name} · {slot?.day}, Period {slot?.period}</p><dl className="detail-list"><dt>Faculty</dt><dd>{data.faculty.find((item) => item.id === entry.facultyId)?.name}</dd><dt>Room</dt><dd>{data.classrooms.find((item) => item.id === entry.roomId)?.name}</dd></dl><div className="modal-actions"><button className="secondary-button" onClick={onClose}>Keep session</button><button className="danger-button" onClick={onDelete}>Delete from draft</button></div></div></div>; }
function DataPage({ name, data, canEdit, setNotice }) { const items = data[name] || []; const labels = { departments: ['Department', 'name', 'code'], divisions: ['Division', 'name', 'studentCount'], subjects: ['Subject', 'name', 'requiredSessions'], faculty: ['Faculty', 'name', 'qualifications'], classrooms: ['Classroom', 'name', 'capacity'] }; const [label, key, secondary] = labels[name]; return <><PageHeading eyebrow="Configuration" title={label} description={`Manage the ${name} used by the scheduling engine.`} action={canEdit && <button className="primary-button compact" onClick={() => setNotice(`${label} creation is ready for database persistence.`)}>+ Add {label}</button>} /><section className="panel table-panel"><div className="table-toolbar"><strong>{items.length} records</strong><input placeholder={`Search ${name}...`} /></div><table className="data-table"><thead><tr><th>{label}</th><th>{name === 'divisions' ? 'Students' : name === 'faculty' ? 'Can teach' : name === 'subjects' ? 'Sessions / room' : name === 'classrooms' ? 'Capacity / type' : 'Code'}</th><th>Status</th>{canEdit && <th />}</tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><b>{item[key]}</b><small>{item.departmentId || item.id}</small></td><td>{Array.isArray(item[secondary]) ? item[secondary].length + ' qualified subjects' : `${item[secondary]}${name === 'subjects' ? ' / ' + item.roomType : ''}`}</td><td><span className="state-pill success">Active</span></td>{canEdit && <td><button className="icon-button" title="Edit" onClick={() => setNotice(`${label} editing will persist when Supabase is connected.`)}>✎</button><button className="icon-button" title="Delete" onClick={() => setNotice('Protected seed data cannot be deleted in demo mode.')}>⌫</button></td>}</tr>)}</tbody></table></section></>; }
function AvailabilityPage({ data }) { return <><PageHeading eyebrow="Configuration" title="Time slots & availability" description="Review the weekly teaching grid and the resources available inside each period." /><section className="panel table-panel"><div className="panel-heading"><div><p className="eyebrow">Weekly grid</p><h2>Teaching periods</h2></div><span className="state-pill success">{data.timeSlots.length} slots configured</span></div><table className="availability-table"><thead><tr><th>Day</th>{[1, 2, 3, 4, 5].map((period) => <th key={period}>Period {period}</th>)}</tr></thead><tbody>{days.map((day) => <tr key={day}><th>{day}</th>{[1, 2, 3, 4, 5].map((period) => { const slot = data.timeSlots.find((item) => item.day === day && item.period === period); return <td key={period}>{slot ? <span className="availability-open">Open</span> : <span className="availability-closed">Closed</span>}</td>; })}</tr>)}</tbody></table></section><div className="dashboard-grid availability-cards"><section className="panel"><p className="eyebrow">Faculty</p><h2>{data.faculty.length} availability profiles</h2><p>Use each faculty record to control which slots the generator may consider.</p></section><section className="panel"><p className="eyebrow">Classrooms</p><h2>{data.classrooms.length} rooms and labs</h2><p>Capacity and room type are enforced as hard constraints.</p></section></div></>; }
function VersionsPage({ entries }) { return <><PageHeading eyebrow="Audit trail" title="Timetable versions" description="Every generated draft gets a clear place in the publishing history." action={<button className="secondary-button">Export history ↓</button>} /><section className="panel table-panel"><table className="data-table versions-table"><thead><tr><th>Version</th><th>Created</th><th>Status</th><th>Sessions</th><th /></tr></thead><tbody>{[['v3', 'Sep 24, 2026', 'Published', entries.length || 42], ['v2', 'Sep 23, 2026', 'Archived', 41], ['v1', 'Sep 20, 2026', 'Archived', 39]].map(([version, date, status, count]) => <tr key={version}><td><b>{version}</b></td><td>{date}</td><td><span className={`state-pill ${status === 'Published' ? 'success' : 'muted'}`}>{status}</span></td><td>{count} sessions</td><td><button className="text-link">View →</button></td></tr>)}</tbody></table></section></>; }
function ReportsPage({ data, entries }) { return <><PageHeading eyebrow="Reports" title="Scheduling reports" description="Simple operational views for sharing and review." /><div className="report-grid">{[['Faculty timetable', `${data.faculty.length} teaching profiles`], ['Division timetable', `${data.divisions.length} student groups`], ['Classroom utilization', `${data.classrooms.length} rooms tracked`], ['Conflict report', `${entries.length ? 0 : '—'} unresolved conflicts`]].map(([title, detail]) => <section className="panel report-card" key={title}><span className="report-mark">▤</span><h2>{title}</h2><p>{detail}</p><button className="text-link">View report →</button></section>)}</div></>; }
function EmptyLink({ text, href }) { return <div className="empty-state"><span className="empty-icon">◌</span><p>{text}</p><Link className="secondary-button" to={href}>Go there →</Link></div>; }
export default App;
