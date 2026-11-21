import { BookOpen, Database, FolderOpen, LayoutDashboard, Users } from 'lucide-react'
import { HashRouter, NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { Brand } from './components/Brand'
import { CAN_EDIT_LIBRARY } from './permissions'
import { SyncBanners } from './components/SyncBanners'
import { SyncStatus } from './components/SyncStatus'
import { ThemeToggle } from './components/ThemeToggle'
import { Dashboard } from './pages/Dashboard'
import { DataPage } from './pages/DataPage'
import { GuideView } from './pages/GuideView'
import { MaterialFolder, Materials } from './pages/Materials'
import { SetEditor } from './pages/SetEditor'
import { SetViewer } from './pages/SetViewer'
import { StudentDetail } from './pages/StudentDetail'
import { StudentForm } from './pages/StudentForm'
import { Students } from './pages/Students'
import { VocabWords } from './pages/VocabWords'

const NAV = [
  { to: '/', label: 'Обзор', icon: LayoutDashboard, end: true },
  { to: '/students', label: 'Ученики', icon: Users },
  { to: '/materials', label: 'Материалы', icon: FolderOpen },
  { to: '/words', label: 'Словарь', icon: BookOpen },
  { to: '/data', label: 'Данные', icon: Database },
]

/** Без прав на библиотеку редактор сета открывает просмотр сета. */
function ToSetViewer() {
  const { id } = useParams()
  return <Navigate to={`/sets/${id}`} replace />
}

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
            <Route path="/materials/guides/:id" element={<GuideView />} />
            <Route path="/materials/:folder" element={<MaterialFolder />} />
            <Route path="/sets/new" element={CAN_EDIT_LIBRARY ? <SetEditor /> : <Navigate to="/materials" replace />} />
            <Route path="/sets/:id" element={<SetViewer />} />
            <Route path="/sets/:id/edit" element={CAN_EDIT_LIBRARY ? <SetEditor /> : <ToSetViewer />} />
            <Route path="/words" element={<VocabWords />} />
            <Route path="/data" element={<DataPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}
