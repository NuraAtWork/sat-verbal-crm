import { ChevronDown, Plus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { formatDate } from '../dates'
import { newId } from '../db'
import { LESSON_PRESETS } from '../lessonPresets'
import { OUTCOME_LABELS, lessonTitle } from '../lessons'
import { skillName } from '../sat'
import type { LessonTemplate } from '../types'
import { useStore } from '../useStore'
import '../lessons.css'

// Раздел «Уроки»: все уроки по ученикам и заготовки (готовые и свои).

function Tabs() {
  return (
    <nav className="le-tabs">
      <NavLink to="/lessons" end>
        Уроки
      </NavLink>
      <NavLink to="/lessons/templates">Заготовки</NavLink>
    </nav>
  )
}

export function Lessons() {
  const { db } = useStore()
  const [studentId, setStudentId] = useState('')
  const name = (id: string) => db.students.find((s) => s.id === id)?.name ?? '—'
  const lessons = db.lessons
    .filter((l) => !studentId || l.studentId === studentId)
    .sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="page">
      <div className="page-head">
        <h1>Уроки</h1>
        <Link className="btn btn-primary" to={`/lessons/new${studentId ? `?student=${studentId}` : ''}`}>
          <Plus size={16} aria-hidden="true" /> Новый урок
        </Link>
      </div>
      <Tabs />

      {db.lessons.length === 0 ? (
        <div className="card">
          <p className="muted">
            Уроков пока нет. Урок собирается из блоков: тема, цели, хороший результат, теория, практика и домашнее
            задание. Можно начать с готовой заготовки по навыку и поправить её под ученика.
          </p>
          <div className="row">
            <Link className="btn btn-primary" to="/lessons/new">
              Собрать урок
            </Link>
            <Link className="btn" to="/lessons/templates">
              Посмотреть заготовки
            </Link>
          </div>
        </div>
      ) : (
        <section className="card">
          <div className="toolbar">
            <select className="input le-filter" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">Все ученики</option>
              {db.students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <span className="muted small">{lessons.length} всего</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Ученик</th>
                  <th>Тема</th>
                  <th>Результат</th>
                  <th>Оплата</th>
                </tr>
              </thead>
              <tbody>
                {lessons.map((l) => (
                  <tr key={l.id}>
                    <td className="le-nowrap">{formatDate(l.date)}</td>
                    <td>
                      <Link to={`/students/${l.studentId}`}>{name(l.studentId)}</Link>
                    </td>
                    <td>
                      <Link to={`/lessons/${l.id}`}>{lessonTitle(l)}</Link>
                    </td>
                    <td>
                      {l.plan?.outcome ? (
                        <span className={`badge le-outcome-${l.plan.outcome}`}>{OUTCOME_LABELS[l.plan.outcome]}</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${l.paid ? 'badge-active' : 'badge-unpaid'}`}>
                        {l.paid ? 'оплачен' : 'не оплачен'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

export function LessonTemplates() {
  const { db, dispatch } = useStore()
  const navigate = useNavigate()
  const own = [...db.lessonTemplates].sort((a, b) => a.plan.title.localeCompare(b.plan.title, 'ru'))

  /** Копирует готовую заготовку в свои и открывает её для правки. */
  const makeOwn = (t: LessonTemplate) => {
    const id = newId()
    dispatch({
      type: 'template/upsert',
      template: { ...t, id, plan: { ...t.plan, templateId: '' }, createdAt: new Date().toISOString() },
    })
    navigate(`/lessons/templates/${id}`)
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Уроки</h1>
        <Link className="btn btn-primary" to="/lessons/templates/new">
          <Plus size={16} aria-hidden="true" /> Новая заготовка
        </Link>
      </div>
      <Tabs />

      <section className="card">
        <h2>Мои заготовки</h2>
        {own.length === 0 ? (
          <p className="muted">
            Своих заготовок пока нет. Соберите новую, сохраните удачный урок как заготовку или сделайте свою версию
            готовой.
          </p>
        ) : (
          <div className="le-templates">
            {own.map((t) => (
              <TemplateCard key={t.id} t={t}>
                <Link className="btn btn-small btn-primary" to={`/lessons/new?template=${t.id}`}>
                  Провести урок
                </Link>
                <Link className="btn btn-small" to={`/lessons/templates/${t.id}`}>
                  Изменить
                </Link>
              </TemplateCard>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Готовые</h2>
        <p className="muted small">
          По одной на каждый навык Reading &amp; Writing и три служебных урока. Готовые заготовки не меняются — урок из
          них правится под ученика, а «Сделать свою» создаёт копию для правки.
        </p>
        <div className="le-templates">
          {LESSON_PRESETS.map((t) => (
            <TemplateCard key={t.id} t={t}>
              <Link className="btn btn-small btn-primary" to={`/lessons/new?template=${encodeURIComponent(t.id)}`}>
                Провести урок
              </Link>
              <button className="btn btn-small" onClick={() => makeOwn(t)}>
                Сделать свою
              </button>
            </TemplateCard>
          ))}
        </div>
      </section>
    </div>
  )
}

function TemplateCard({ t, children }: { t: LessonTemplate; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const parts: [string, string][] = [
    ['Цели урока', t.plan.goals],
    ['Хороший результат', t.plan.success],
    ['Теория', t.plan.theory],
    ['Практика на уроке', t.plan.practice],
    ['Домашнее задание', t.homework],
  ]
  return (
    <article className={`le-template ${open ? 'open' : ''}`}>
      <button className="le-template-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="le-template-title">{t.plan.title || 'Без названия'}</span>
        <span className="muted small">
          {t.durationMin} мин{t.skills.length > 0 && ` · ${t.skills.map(skillName).join(', ')}`}
        </span>
        <ChevronDown size={16} aria-hidden="true" className="le-chevron" />
      </button>
      {open && (
        <div className="le-template-body">
          {parts
            .filter(([, text]) => text)
            .map(([label, text]) => (
              <div key={label}>
                <div className="le-part-label">{label}</div>
                <p className="le-text">{text}</p>
              </div>
            ))}
        </div>
      )}
      <div className="le-template-actions">{children}</div>
    </article>
  )
}
