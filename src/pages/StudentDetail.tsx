import { Pencil, Plus, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { StudentAssignments } from '../components/Assignments'
import { NextSets, SkillAnalyticsCard } from '../components/SkillAnalytics'
import { ScoreChart } from '../components/ScoreChart'
import { StatusBadge } from '../components/StatusBadge'
import { StudentPortal } from '../components/StudentPortal'
import { StudentGrammar } from '../components/StudentGrammar'
import { StudentVocab } from '../components/StudentVocab'
import { describeExam, formatDate, today } from '../dates'
import { OUTCOME_LABELS } from '../lessons'
import { DOMAINS, parseScore, skillName } from '../sat'
import '../lessons.css'
import { lessonsOf, newId, scoresOf } from '../db'
import { useSkillAnalytics } from '../useSkillAnalytics'
import { useStore } from '../useStore'
import type { Lesson, Student } from '../types'

export function StudentDetail() {
  const { id } = useParams()
  const { db } = useStore()
  const student = db.students.find((s) => s.id === id)
  // Аналитика по навыкам (облако): reloadKey перечитывает и её, и список заданий.
  const [reloadKey, setReloadKey] = useState(0)
  const skillData = useSkillAnalytics(student?.id, reloadKey)
  const reload = () => setReloadKey((k) => k + 1)

  if (!student) {
    return (
      <div className="page">
        <p>Ученик не найден.</p>
        <Link to="/students">← К списку</Link>
      </div>
    )
  }

  const scores = scoresOf(db, student.id)
  const lessons = lessonsOf(db, student.id)
  const latest = scores.length ? scores[scores.length - 1].score : null

  return (
    <div className="page">
      <Link className="back" to="/students">
        ← Ученики
      </Link>
      <div className="page-head">
        <h1>
          {student.name} <StatusBadge status={student.status} />
        </h1>
        <Link className="btn" to={`/students/${student.id}/edit`}>
          <Pencil size={15} aria-hidden="true" /> Редактировать
        </Link>
      </div>

      <div className="stats">
        <div className="stat">
          <span className="stat-value">{student.baselineScore ?? '—'}</span>
          <span className="stat-label">Стартовый балл</span>
        </div>
        <div className="stat">
          <span className="stat-value">{latest ?? '—'}</span>
          <span className="stat-label">Последний тест</span>
        </div>
        <div className="stat">
          <span className="stat-value">{student.targetScore ?? '—'}</span>
          <span className="stat-label">Цель</span>
        </div>
        <div className="stat">
          <span className="stat-value small-value">{student.examDate ? formatDate(student.examDate) : '—'}</span>
          <span className="stat-label">Экзамен {student.examDate && `· ${describeExam(student.examDate)}`}</span>
        </div>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2>Профиль</h2>
          <dl className="dl">
            <dt>Контакт</dt>
            <dd>{student.contact || '—'}</dd>
            <dt>Родитель</dt>
            <dd>{student.parentContact || '—'}</dd>
            <dt>Занимается с</dt>
            <dd>{formatDate(student.startDate)}</dd>
            <dt>Уроков</dt>
            <dd>
              {lessons.length}
              {lessons.some((l) => !l.paid) && (
                <span className="muted"> · не оплачено: {lessons.filter((l) => !l.paid).length}</span>
              )}
            </dd>
          </dl>
          {student.notes && <p className="notes">{student.notes}</p>}
        </section>

        {skillData.enabled ? (
          <NextSets data={skillData} studentId={student.id} onAssigned={reload} />
        ) : (
          <section className="card">
            <h2>Пройденные темы</h2>
            <SkillCoverage lessons={lessons} />
          </section>
        )}
      </div>

      {/* В облаке «проходили на уроках» и «как решает» — одна таблица навыков вместо «Пройденных тем». */}
      {skillData.enabled && <SkillAnalyticsCard data={skillData} lessons={lessons} onReload={reload} />}

      <section className="card">
        <h2>Кабинет ученика</h2>
        <StudentPortal key={student.id} student={student} />
      </section>

      <section className="card">
        <h2>Задания</h2>
        <StudentAssignments key={reloadKey} student={student} />
      </section>

      <section className="card">
        <h2>Словарь</h2>
        <StudentVocab key={student.id} student={student} />
      </section>

      <section className="card">
        <h2>Грамматика</h2>
        <StudentGrammar key={student.id} student={student} />
      </section>

      <section className="card">
        <h2>Прогресс R&W</h2>
        <ScoreChart scores={scores} baseline={student.baselineScore} target={student.targetScore} />
        <ScoreList studentId={student.id} />
        <AddScoreForm student={student} />
      </section>

      <section className="card">
        <h2>Уроки</h2>
        <Link className="btn btn-primary" to={`/lessons/new?student=${student.id}`}>
          <Plus size={16} aria-hidden="true" /> Собрать урок
        </Link>
        <LessonList lessons={lessons} />
      </section>
    </div>
  )
}

function SkillCoverage({ lessons }: { lessons: Lesson[] }) {
  const counts = new Map<string, number>()
  for (const l of lessons) for (const t of l.topics) counts.set(t, (counts.get(t) ?? 0) + 1)

  return (
    <div className="coverage">
      {DOMAINS.map((d) => (
        <div key={d.id} className="coverage-domain">
          <div className="coverage-title">{d.name}</div>
          <div className="chips">
            {d.skills.map((s) => {
              const n = counts.get(s.id) ?? 0
              return (
                <span key={s.id} className={`chip ${n ? 'chip-on' : 'chip-off'}`} title={`Уроков: ${n}`}>
                  {s.name}
                  {n > 0 && <b> ×{n}</b>}
                </span>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function ScoreList({ studentId }: { studentId: string }) {
  const { db, dispatch } = useStore()
  const scores = scoresOf(db, studentId).reverse()
  if (scores.length === 0) return null
  return (
    <table className="table compact">
      <thead>
        <tr>
          <th>Дата</th>
          <th>Тест</th>
          <th className="num">Балл</th>
          <th>Заметки</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {scores.map((s) => (
          <tr key={s.id}>
            <td>{formatDate(s.date)}</td>
            <td>{s.source || '—'}</td>
            <td className="num">
              <strong>{s.score}</strong>
            </td>
            <td className="muted">{s.notes}</td>
            <td className="actions">
              <button
                className="icon-btn"
                title="Удалить"
                onClick={() => confirm('Удалить результат теста?') && dispatch({ type: 'score/delete', id: s.id })}
              >
                <X size={15} aria-hidden="true" />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function AddScoreForm({ student }: { student: Student }) {
  const { dispatch } = useStore()
  const [date, setDate] = useState(today())
  const [source, setSource] = useState('')
  const [score, setScore] = useState('')
  const [notes, setNotes] = useState('')

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const value = parseScore(score)
    if (value === null) return
    dispatch({
      type: 'score/upsert',
      score: { id: newId(), studentId: student.id, date, source: source.trim(), score: value, notes: notes.trim() },
    })
    setSource('')
    setScore('')
    setNotes('')
  }

  return (
    <form className="inline-form" onSubmit={onSubmit}>
      <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      <input
        className="input grow"
        placeholder="Тест (напр. Bluebook PT 4)"
        value={source}
        onChange={(e) => setSource(e.target.value)}
      />
      <input
        className="input score-input"
        type="number"
        min={200}
        max={800}
        step={10}
        placeholder="Балл"
        value={score}
        onChange={(e) => setScore(e.target.value)}
        required
      />
      <input className="input grow" placeholder="Заметки" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <button className="btn btn-primary" type="submit">
        Добавить тест
      </button>
    </form>
  )
}

function LessonList({ lessons }: { lessons: Lesson[] }) {
  const { dispatch } = useStore()
  if (lessons.length === 0) return <p className="muted">Уроков пока не было.</p>

  return (
    <ul className="lessons">
      {lessons.map((l) => (
        <li key={l.id} className="lesson">
          <div className="lesson-head">
            <strong>{formatDate(l.date)}</strong>
            <Link to={`/lessons/${l.id}`}>{l.plan?.title || 'Открыть урок'}</Link>
            <span className="muted">{l.durationMin} мин</span>
            {l.plan?.outcome && (
              <span className={`badge le-outcome-${l.plan.outcome}`}>{OUTCOME_LABELS[l.plan.outcome]}</span>
            )}
            <button
              className={`badge ${l.paid ? 'badge-active' : 'badge-unpaid'}`}
              title="Нажмите, чтобы переключить"
              onClick={() => dispatch({ type: 'lesson/upsert', lesson: { ...l, paid: !l.paid } })}
            >
              {l.paid ? 'оплачен' : 'не оплачен'}
            </button>
            <button
              className="icon-btn push-right"
              title="Удалить урок"
              onClick={() => confirm('Удалить урок?') && dispatch({ type: 'lesson/delete', id: l.id })}
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
          {l.topics.length > 0 && (
            <div className="chips">
              {l.topics.map((t) => (
                <span key={t} className="chip chip-on small">
                  {skillName(t)}
                </span>
              ))}
            </div>
          )}
          {l.homework && (
            <div>
              <span className="muted">ДЗ:</span> {l.homework}
            </div>
          )}
          {l.notes && <div className="muted">{l.notes}</div>}
        </li>
      ))}
    </ul>
  )
}
