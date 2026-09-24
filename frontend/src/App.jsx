import { Routes, Route, Link } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/departments', label: 'Departments' },
  { to: '/divisions', label: 'Divisions' },
  { to: '/subjects', label: 'Subjects' },
  { to: '/faculty', label: 'Faculty' },
  { to: '/classrooms', label: 'Classrooms' },
  { to: '/time-slots', label: 'Time Slots' },
  { to: '/availability', label: 'Availability' },
  { to: '/timetable/generate', label: 'Generate' },
  { to: '/timetable/view', label: 'Timetable' },
  { to: '/timetable/versions', label: 'Versions' },
  { to: '/conflicts', label: 'Conflicts' },
];

function DashboardPage() {
  return (
    <div>
      <h1>Admin Dashboard</h1>
      <div className="stats-grid">
        <StatCard title="Departments" value="3" />
        <StatCard title="Divisions" value="6" />
        <StatCard title="Faculty" value="10" />
        <StatCard title="Classrooms" value="8" />
        <StatCard title="Subjects" value="18" />
        <StatCard title="Current version" value="V2" />
        <StatCard title="Last generation" value="Published" />
        <StatCard title="Conflicts" value="0" />
      </div>
    </div>
  );
}

function StatCard({ title, value }) {
  return (
    <div className="stat-card">
      <div className="stat-title">{title}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

function PlaceholderPage({ title }) {
  return (
    <div>
      <h1>{title}</h1>
      <p>This page is ready for the next implementation phase.</p>
    </div>
  );
}

export default function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">Timetable MDP</div>
        <nav>
          {navItems.map((item) => (
            <Link key={item.to} to={item.to} className="nav-link">
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/departments" element={<PlaceholderPage title="Departments" />} />
          <Route path="/divisions" element={<PlaceholderPage title="Divisions" />} />
          <Route path="/subjects" element={<PlaceholderPage title="Subjects" />} />
          <Route path="/faculty" element={<PlaceholderPage title="Faculty" />} />
          <Route path="/classrooms" element={<PlaceholderPage title="Classrooms" />} />
          <Route path="/time-slots" element={<PlaceholderPage title="Time Slots" />} />
          <Route path="/availability" element={<PlaceholderPage title="Availability" />} />
          <Route path="/timetable/generate" element={<PlaceholderPage title="Generate Timetable" />} />
          <Route path="/timetable/view" element={<PlaceholderPage title="Timetable View" />} />
          <Route path="/timetable/versions" element={<PlaceholderPage title="Timetable Versions" />} />
          <Route path="/conflicts" element={<PlaceholderPage title="Conflicts" />} />
        </Routes>
      </main>
    </div>
  );
}
