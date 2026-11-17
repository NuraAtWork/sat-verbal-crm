import { GraduationCap, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { StatusBadge } from '../components/StatusBadge'
import { addDays, describeExam, formatDate, today } from '../dates'
import { demoDb } from '../demo'
import { skillName } from '../sat'
import { latestScore } from '../db'
import { useStore } from '../useStore'

export function Dashboard() {
  const { db, dispatch, sync } = useStore()
  const t = today()
  const weekAgo = addDays(t, -7)

  const active = db.students.filter((s) => s.status === 'active')
  const leads = db.students.filter((s) => s.status === 'lead')
  const lessonsThisWeek = db.lessons.filter((l) => l.date > weekAgo && l.date <= t)
  const unpaid = db.lessons.filter((l) => !l.paid)

  const gains = db.students
    .map((s) => {
      const last = latestScore(db, s.id)
      return s.baselineScore !== null && last !== null ? last - s.baselineScore : null
    })
    .filter((g): g is number => g !== null)
  const avgGain = gains.length ? Math.round(gains.reduce((a, b) => a + b, 0) / gains.length) : null

  const upcomingExams = db.students
    .filter((s) => s.examDate && s.examDate >= t && s.status !== 'finished')
    .sort((a, b) => a.examDate.localeCompare(b.examDate))
    .slice(0, 5)

  const recentLessons = [...db.lessons].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6)
  const studentName = (id: string) => db.students.find((s) => s.id === id)?.name ?? '—'

  if (db.students.length === 0) {
    return (
      <div className="page">
        <h1>Обзор</h1>
        <div className="card empty">
          <span className="empty-icon" aria-hidden="true">
            <GraduationCap size={22} />
          </span>
          <h2>Добавьте первого ученика</h2>
          <p className="muted">
            Здесь появятся активные ученики, ближайшие экзамены, уроки и сданные задания.
          </p>
          <div className="row">
            <Link className="btn btn-primary" to="/students/new">
              <Plus size={16} aria-hidden="true" /> Добавить ученика
            </Link>
            {sync.mode === 'local' && db.materials.length === 0 && (
              <button className="btn" onClick={() => dispatch({ type: 'db/replace', db: demoDb() })}>
                Загрузить демо-данные
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Обзор</h1>
        <Link className="btn btn-primary" to="/students/new">
          <Plus size={16} aria-hidden="true" /> Ученик
        </Link>
      </div>

      <div className="stats">
        <div className="stat">
          <span className="stat-value">{active.length}</span>
          <span className="stat-label">Активные ученики</span>
        </div>
        <div className="stat">
          <span className="stat-value">{lessonsThisWeek.length}</span>
          <span className="stat-label">Уроков за 7 дней</span>
        </div>
        <div className="stat">
          <span className="stat-value">{avgGain === null ? '—' : `${avgGain > 0 ? '+' : ''}${avgGain}`}</span>
          <span className="stat-label">Средний прирост R&W</span>
        </div>
        <div className="stat">
          <span className="stat-value">{unpaid.length}</span>
          <span className="stat-label">Неоплаченные уроки</span>
        </div>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2>Ближайшие экзамены</h2>
          {upcomingExams.length === 0 ? (
            <p className="muted">Нет запланированных экзаменов.</p>
          ) : (
            <ul className="list">
              {upcomingExams.map((s) => (
                <li key={s.id}>
                  <Link to={`/students/${s.id}`}>{s.name}</Link>
                  <span className="muted">
                    {formatDate(s.examDate)} · {describeExam(s.examDate)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>Последние уроки</h2>
          {recentLessons.length === 0 ? (
            <p className="muted">Уроков пока не было.</p>
          ) : (
            <ul className="list">
              {recentLessons.map((l) => (
                <li key={l.id}>
                  <Link to={`/students/${l.studentId}`}>{studentName(l.studentId)}</Link>
                  <span className="muted">
                    {formatDate(l.date)}
                    {l.topics.length > 0 && ` · ${l.topics.map(skillName).join(', ')}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {leads.length > 0 && (
        <section className="card">
          <h2>Заявки</h2>
          <ul className="list">
            {leads.map((s) => (
              <li key={s.id}>
                <Link to={`/students/${s.id}`}>{s.name}</Link>
                <span className="muted">
                  <StatusBadge status={s.status} /> {s.contact}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
