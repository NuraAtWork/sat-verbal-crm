import { useState } from 'react'
import { Plus, Users } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { StatusBadge } from '../components/StatusBadge'
import { describeExam } from '../dates'
import { STATUSES, STATUS_LABELS } from '../sat'
import { latestScore } from '../db'
import { useStore } from '../useStore'
import type { StudentStatus } from '../types'

export function Students() {
  const { db } = useStore()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StudentStatus | 'all'>('all')

  const q = query.trim().toLowerCase()
  const rows = db.students
    .filter((s) => status === 'all' || s.status === status)
    .filter(
      (s) =>
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.contact.toLowerCase().includes(q) ||
        s.parentContact.toLowerCase().includes(q),
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))

  const lessonCount = (id: string) => db.lessons.filter((l) => l.studentId === id).length

  return (
    <div className="page">
      <div className="page-head">
        <h1>Ученики</h1>
        <Link className="btn btn-primary" to="/students/new">
          <Plus size={16} aria-hidden="true" /> Ученик
        </Link>
      </div>

      <div className="toolbar">
        <input
          className="input search"
          type="search"
          placeholder="Поиск по имени или контакту"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="chips">
          <button className={`chip ${status === 'all' ? 'chip-on' : ''}`} onClick={() => setStatus('all')}>
            Все
          </button>
          {STATUSES.map((s) => (
            <button key={s} className={`chip ${status === s ? 'chip-on' : ''}`} onClick={() => setStatus(s)}>
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card empty">
          <span className="empty-icon" aria-hidden="true">
            <Users size={22} />
          </span>
          <p className="muted">
            {db.students.length === 0 ? 'Учеников пока нет.' : 'Никого не нашлось по этому фильтру.'}
          </p>
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Имя</th>
                <th>Статус</th>
                <th className="num">Старт</th>
                <th className="num">Сейчас</th>
                <th className="num">Цель</th>
                <th>Экзамен</th>
                <th className="num">Уроков</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="clickable" onClick={() => navigate(`/students/${s.id}`)}>
                  <td>
                    <strong>{s.name}</strong>
                    {s.contact && <div className="muted small">{s.contact}</div>}
                  </td>
                  <td>
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="num">{s.baselineScore ?? '—'}</td>
                  <td className="num">{latestScore(db, s.id) ?? '—'}</td>
                  <td className="num">{s.targetScore ?? '—'}</td>
                  <td>{describeExam(s.examDate)}</td>
                  <td className="num">{lessonCount(s.id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
