import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
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

export default function App() {
  return (
    <HashRouter>
      <div className="layout">
        <aside className="sidebar">
          <div className="brand">
            <span className="brand-mark">RW</span>
            <span>
              SAT Verbal
              <small>CRM</small>
            </span>
          </div>
          <nav className="nav">
            <NavLink to="/" end>
              Обзор
            </NavLink>
            <NavLink to="/students">Ученики</NavLink>
            <NavLink to="/materials">Материалы</NavLink>
            <NavLink to="/data">Данные</NavLink>
          </nav>
          <ThemeToggle />
          <SyncStatus />
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
