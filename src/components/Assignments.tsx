import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDate } from '../dates'
import { DOMAINS, SKILLS } from '../sat'
import { assignmentStatus, createAssignment, deleteAssignment, formatDuration, listAssignments, solveUrl } from '../sets'
import { supabase } from '../supabase'
import type { Assignment, Material, Student } from '../types'
import { useStore } from '../useStore'

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Кнопка «Скопировать ссылку» с подтверждением. */
export function CopyLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className="btn btn-small"
      onClick={async () => {
        await navigator.clipboard.writeText(solveUrl(token))
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? 'Скопировано ✓' : 'Скопировать ссылку'}
    </button>
  )
}

/** Сеты, доступные для заданий, сгруппированные по первой категории. */
export function SetSelectOptions({ sets }: { sets: Material[] }) {
  const groups = SKILLS.map((s) => ({
    skill: s,
    items: sets.filter((m) => m.skills[0] === s.id),
  })).filter((g) => g.items.length > 0)
  const rest = sets.filter((m) => !SKILLS.some((s) => s.id === m.skills[0]))
  return (
    <>
      {groups.map((g) => (
        <optgroup key={g.skill.id} label={`${DOMAINS.find((d) => d.id === g.skill.domainId)?.name} · ${g.skill.name}`}>
          {g.items.map((m) => (
            <option key={m.setId!} value={m.setId!}>
              {m.title}
            </option>
          ))}
        </optgroup>
      ))}
      {rest.length > 0 && (
        <optgroup label="Другое">
          {rest.map((m) => (
            <option key={m.setId!} value={m.setId!}>
              {m.title}
            </option>
          ))}
        </optgroup>
      )}
    </>
  )
}

/** Блок «Задания» в карточке ученика (только облачный режим). */
export function StudentAssignments({ student }: { student: Student }) {
  const { db, sync } = useStore()
  const [items, setItems] = useState<Assignment[] | null>(null)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [open, setOpen] = useState<string | null>(null)
  const [setId, setSetId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [justCreated, setJustCreated] = useState<string | null>(null)

  const sets = db.materials.filter((m) => m.setId).sort((a, b) => a.title.localeCompare(b.title, 'ru', { numeric: true }))
  const titleOf = (id: string) => db.materials.find((m) => m.setId === id)?.title ?? 'Сет'

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    listAssignments(supabase, student.id).then(
      (list) => !cancelled && setItems(list),
      (e: unknown) => !cancelled && setError(errText(e)),
    )
    return () => {
      cancelled = true
    }
  }, [student.id, reloadKey])

  if (sync.mode !== 'cloud' || !supabase) {
    return (
      <p className="muted">
        Задания с решением по ссылке работают в облачном режиме — после подключения Supabase.
      </p>
    )
  }
  const sb = supabase

  const onCreate = async () => {
    if (!setId) return
    setBusy(true)
    setError('')
    try {
      const a = await createAssignment(sb, student.id, setId, dueDate)
      setItems((prev) => [a, ...(prev ?? [])])
      setJustCreated(a.id)
      setSetId('')
      setDueDate('')
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const onDelete = async (a: Assignment) => {
    if (!confirm(`Удалить задание «${titleOf(a.setId)}»${a.submittedAt ? ' вместе с результатом' : ''}?`)) return
    try {
      await deleteAssignment(sb, a.id)
      setItems((prev) => (prev ?? []).filter((x) => x.id !== a.id))
    } catch (e) {
      setError(errText(e))
    }
  }

  return (
    <div className="assignments">
      {sets.length === 0 ? (
        <p className="muted">
          Нет загруженных сетов. Загрузите их в «Данные → Добавить из файла» (файл с сетами вопросов).
        </p>
      ) : (
        <div className="inline-form assign-form">
          <select className="input grow" value={setId} onChange={(e) => setSetId(e.target.value)}>
            <option value="">Выберите сет…</option>
            <SetSelectOptions sets={sets} />
          </select>
          <label className="row small muted">
            срок
            <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
          <button className="btn btn-primary" disabled={!setId || busy} onClick={onCreate}>
            {busy ? 'Создаю…' : 'Задать'}
          </button>
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      <div className="row spread assign-head">
        <span className="muted small">{items ? `Заданий: ${items.length}` : 'Загрузка…'}</span>
        <button className="link-btn" onClick={() => setReloadKey((k) => k + 1)}>
          Обновить
        </button>
      </div>

      {items && items.length > 0 && (
        <ul className="assign-list">
          {items.map((a) => {
            const st = assignmentStatus(a)
            const pct = a.totalCount ? Math.round(((a.correctCount ?? 0) / a.totalCount) * 100) : null
            return (
              <li key={a.id} className={`assign ${justCreated === a.id ? 'assign-new' : ''}`}>
                <div className="assign-row">
                  <span className={`badge ${st.cls}`}>{st.label}</span>
                  <strong className="assign-title">{titleOf(a.setId)}</strong>
                  {a.submittedAt ? (
                    <span className="assign-score">
                      {a.correctCount}/{a.totalCount} <span className="muted">({pct}%)</span> ·{' '}
                      {formatDuration(a.durationSec)}
                    </span>
                  ) : (
                    a.dueDate && <span className="muted small">до {formatDate(a.dueDate)}</span>
                  )}
                  <span className="push-right row">
                    {a.submittedAt ? (
                      <button className="btn btn-small" onClick={() => setOpen(open === a.id ? null : a.id)}>
                        {open === a.id ? 'Скрыть' : 'Результаты'}
                      </button>
                    ) : (
                      <CopyLink token={a.token} />
                    )}
                    <button className="icon-btn" title="Удалить задание" onClick={() => onDelete(a)}>
                      <X size={15} aria-hidden="true" />
                    </button>
                  </span>
                </div>
                {justCreated === a.id && !a.submittedAt && (
                  <p className="small muted">
                    Задание создано — скопируйте ссылку и отправьте ученику. Входить ему никуда не нужно.
                  </p>
                )}
                {open === a.id && a.results && <AssignmentResults a={a} />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Разбор сданного задания для репетитора: ошибки и время по каждому вопросу. */
export function AssignmentResults({ a }: { a: Assignment }) {
  const results = a.results ?? []
  const wrong = results.filter((r) => r.answer && !r.is_correct)
  const skipped = results.filter((r) => !r.answer)
  const answered = results.filter((r) => r.answer).length
  const avg = results.length ? (a.durationSec ?? 0) / results.length : 0
  const slowest = [...results].sort((x, y) => y.time_sec - x.time_sec).slice(0, 3)

  return (
    <div className="results">
      <div className="results-summary small">
        <span>
          Сдано: {a.submittedAt ? new Date(a.submittedAt).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
        </span>
        <span>Отвечено: {answered}/{results.length}</span>
        <span>Среднее время: {formatDuration(avg)}</span>
        <span>Дольше всего: {slowest.map((r) => `№${r.n} (${formatDuration(r.time_sec)})`).join(', ')}</span>
      </div>
      <p className="small">
        <strong>Ошибки:</strong>{' '}
        {wrong.length === 0 ? 'нет' : wrong.map((r) => `№${r.n}`).join(', ')}
        {skipped.length > 0 && (
          <>
            {' · '}
            <strong>Без ответа:</strong> {skipped.map((r) => `№${r.n}`).join(', ')}
          </>
        )}
      </p>
      <div className="qgrid">
        {results.map((r) => (
          <div
            key={r.n}
            className={`qcell ${r.is_correct ? 'qcell-ok' : r.answer ? 'qcell-bad' : 'qcell-skip'}`}
            title={`№${r.n}: ответ ${r.answer ?? '—'}, верно ${r.correct}, ${formatDuration(r.time_sec)}`}
          >
            <span className="qcell-n">{r.n}</span>
            <span className="qcell-a">{r.is_correct ? r.answer : `${r.answer ?? '—'}→${r.correct}`}</span>
            <span className="qcell-t">{formatDuration(r.time_sec)}</span>
          </div>
        ))}
      </div>
      <Link className="small" to={`/sets/${a.setId}`}>
        Открыть сет с ответами →
      </Link>
    </div>
  )
}
