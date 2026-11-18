import { useEffect, useRef, useState } from 'react'
import { Pencil } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { CopyLink } from '../components/Assignments'
import { QuestionView } from '../components/QuestionView'
import { skillName } from '../sat'
import { createAssignment, fetchQuestionSet, isTestSet } from '../sets'
import { supabase } from '../supabase'
import type { QuestionSet } from '../types'
import { useStore } from '../useStore'
import { TestMeta, TestQuestions } from './TestViewer'

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Просмотр сета репетитором: все вопросы с ответами + «Задать ученику». */
export function SetViewer() {
  const { id = '' } = useParams()
  return <SetViewerInner key={id} id={id} />
}

function SetViewerInner({ id }: { id: string }) {
  const { db, sync } = useStore()
  const [set, setSet] = useState<QuestionSet | null | undefined>(undefined)
  const [error, setError] = useState('')
  const [showAnswers, setShowAnswers] = useState(true)

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    fetchQuestionSet(supabase, id).then(
      (s) => !cancelled && setSet(s),
      (e: unknown) => !cancelled && setError(errText(e)),
    )
    return () => {
      cancelled = true
    }
  }, [id])

  const material = db.materials.find((m) => m.setId === id)
  const isTest = isTestSet(set) || material?.kind === 'test'
  const back = (
    <nav className="breadcrumbs">
      <Link to="/materials">Материалы</Link>
      <span>/</span>
      {isTest ? (
        <Link to="/materials/tests">Прошлые тесты</Link>
      ) : (
        <Link to="/materials/questions">Вопросы по категориям</Link>
      )}
      <span>/</span>
    </nav>
  )

  if (sync.mode !== 'cloud' || !supabase) {
    return (
      <div className="page">
        {back}
        <p className="muted">Сеты открываются в облачном режиме — после подключения Supabase.</p>
        {material?.url && (
          <a href={material.url} target="_blank" rel="noopener noreferrer">
            Открыть файл на Google Drive ↗
          </a>
        )}
      </div>
    )
  }

  if (error) {
    return (
      <div className="page">
        {back}
        <p className="error-text">Не удалось загрузить сет: {error}</p>
      </div>
    )
  }
  if (set === undefined) {
    return (
      <div className="page">
        {back}
        <p className="muted">Загрузка…</p>
      </div>
    )
  }
  if (set === null) {
    return (
      <div className="page">
        {back}
        <p className="muted">Этот сет ещё не загружен в облако. Загрузите файл сетов в «Данные → Добавить из файла».</p>
      </div>
    )
  }

  const counts = set.questions.reduce<Record<string, number>>((acc, q) => {
    const d = q.difficulty || '—'
    acc[d] = (acc[d] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="page">
      {back}
      <div className="page-head">
        <h1>{set.title}</h1>
        <Link className="btn" to={`/sets/${set.id}/edit`}>
          <Pencil size={14} aria-hidden="true" /> Редактировать
        </Link>
      </div>
      {isTest ? (
        <TestMeta set={set} />
      ) : (
      <p className="muted set-meta">
        {set.questions.length} вопросов ·{' '}
        {Object.entries(counts)
          .map(([d, n]) => `${n} ${d}`)
          .join(', ')}
        {set.skills.length > 0 && ` · ${set.skills.map(skillName).join(', ')}`}
      </p>
      )}

      <AssignToStudent setId={set.id} />

      <label className="row small">
        <input type="checkbox" checked={showAnswers} onChange={(e) => setShowAnswers(e.target.checked)} />
        Показывать правильные ответы
      </label>

      {isTest ? (
        <TestQuestions set={set} showAnswers={showAnswers} />
      ) : (
        <div className="paper">
          {set.questions.map((q, i) => (
            <QuestionView key={q.n} q={q} correct={showAnswers ? set.answers[i] : undefined} showDifficulty />
          ))}
        </div>
      )}
    </div>
  )
}

function AssignToStudent({ setId }: { setId: string }) {
  const { db } = useStore()
  const [studentId, setStudentId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<{ name: string; token: string }[]>([])
  // ?assign=1 (кнопка «Задать» в материалах) — сразу показываем выбор ученика
  const [params] = useSearchParams()
  const selectRef = useRef<HTMLSelectElement>(null)
  const wantsAssign = params.has('assign')
  useEffect(() => {
    if (!wantsAssign) return
    selectRef.current?.scrollIntoView({ block: 'center' })
    selectRef.current?.focus()
  }, [wantsAssign])

  const students = db.students
    .filter((s) => s.status !== 'finished')
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))

  const onAssign = async () => {
    if (!supabase || !studentId) return
    setBusy(true)
    setError('')
    try {
      const a = await createAssignment(supabase, studentId, setId, dueDate)
      const name = db.students.find((s) => s.id === studentId)?.name ?? ''
      setCreated((prev) => [{ name, token: a.token }, ...prev])
      setStudentId('')
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h2>Задать ученику</h2>
      {students.length === 0 ? (
        <p className="muted">Сначала добавьте ученика.</p>
      ) : (
        <div className="inline-form assign-form">
          <select
            ref={selectRef}
            className="input grow"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
          >
            <option value="">Выберите ученика…</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <label className="row small muted">
            срок
            <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
          <button className="btn btn-primary" disabled={!studentId || busy} onClick={onAssign}>
            {busy ? 'Создаю…' : 'Задать'}
          </button>
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
      {created.length > 0 && (
        <ul className="list">
          {created.map((c) => (
            <li key={c.token} className="row spread">
              <span>
                Задано: <strong>{c.name}</strong>
              </span>
              <CopyLink token={c.token} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
