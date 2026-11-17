import { Database, FolderOpen, LayoutDashboard, Users } from 'lucide-react'
import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { Brand } from './components/Brand'
import { SyncBanners } from './components/SyncBanners'
import { SyncStatus } from './components/SyncStatus'
import { ThemeToggle } from './components/ThemeToggle'
import { Dashboard } from './pages/Dashboard'
import { DataPage } from './pages/DataPage'
import { MaterialFolder, Materials } from './pages/Materials'
import { SetViewer } from './pages/SetViewer'
import { StudentDetail } from './pages/StudentDetail'
import { StudentForm } from './pages/StudentForm'
import { Students } from './pages/Students'

const NAV = [
  { to: '/', label: 'Обзор', icon: LayoutDashboard, end: true },
  { to: '/students', label: 'Ученики', icon: Users },
  { to: '/materials', label: 'Материалы', icon: FolderOpen },
  { to: '/data', label: 'Данные', icon: Database },
]

export default function App() {
  return (
    <HashRouter>
      <div className="layout">
        <aside className="sidebar">
          <Brand />
          <div className="nav-label">Рабочее пространство</div>
          <nav className="nav">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end}>
                <Icon size={16} strokeWidth={2} aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-foot">
            <ThemeToggle />
            <SyncStatus />
          </div>
        </aside>
        <main className="main">
          <SyncBanners />
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/students" element={<Students />} />
            <Route path="/students/new" element={<StudentForm />} />
            <Route path="/students/:id" element={<StudentDetail />} />
            <Route path="/students/:id/edit" element={<StudentForm />} />
            <Route path="/materials" element={<Materials />} />
            <Route path="/materials/:folder" element={<MaterialFolder />} />
            <Route path="/sets/:id" element={<SetViewer />} />
            <Route path="/data" element={<DataPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}
