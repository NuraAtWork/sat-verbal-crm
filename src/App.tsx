import { BookOpen, Database, FolderOpen, LayoutDashboard, PanelLeftClose, PanelLeftOpen, Users } from 'lucide-react'
import { useState } from 'react'
import { HashRouter, NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { Brand } from './components/Brand'
import { CAN_EDIT_LIBRARY, SHOW_GUIDES } from './permissions'
import { storeSidebarCollapsed, storedSidebarCollapsed } from './sidebar'
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
  const [collapsed, setCollapsed] = useState(storedSidebarCollapsed)

  const toggleSidebar = () => {
    storeSidebarCollapsed(!collapsed)
    setCollapsed(!collapsed)
  }

  return (
    <HashRouter>
      <div className={collapsed ? 'layout is-collapsed' : 'layout'}>
        <aside className="sidebar">
          <div className="sidebar-top">
            <Brand />
            <button
              className="icon-btn sidebar-toggle"
              onClick={toggleSidebar}
              aria-expanded={!collapsed}
              aria-label={collapsed ? 'Развернуть панель' : 'Свернуть панель'}
              title={collapsed ? 'Развернуть панель' : 'Свернуть панель'}
            >
              {collapsed ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}
            </button>
          </div>
          <div className="nav-label">Рабочее пространство</div>
          <nav className="nav">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} aria-label={label} title={collapsed ? label : undefined}>
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
            <Route
              path="/materials/guides/:id"
              element={SHOW_GUIDES ? <GuideView /> : <Navigate to="/materials" replace />}
            />
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
