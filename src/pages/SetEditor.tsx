import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Copy,
  CopyPlus,
  Plus,
  Save,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { QuestionView } from '../components/QuestionView'
import { RichField } from '../components/RichField'
import { plural } from '../dates'
import { newId } from '../db'
import { cleanForSave, htmlToText, isBlankHtml } from '../html'
import { DOMAINS, SKILLS, skillName } from '../sat'
import {
  deleteSet,
  fetchSetRow,
  fetchSetUsage,
  insertSet,
  SetConflictError,
  updateSet,
  type SetRow,
  type SetUsage,
} from '../setsAdmin'
import { supabase } from '../supabase'
import type { Material, SetQuestion } from '../types'
import { useStore } from '../useStore'
import '../setEditor.css'

const LETTERS = ['A', 'B', 'C', 'D'] as const
const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Вопрос в редакторе. base — исходный объект целиком: незнакомые поля сохраняются как есть. */
interface DraftQ {
  key: string
  /** Индекс в исходном сете; null — новый вопрос (добавлен или дублирован) */
  orig: number | null
  base: SetQuestion
  difficulty: string
  stimulus: string
  stem: string
  choices: string[]
  answer: string
}

interface Draft {
  title: string
  subtitle: string
  skill: string
  questions: DraftQ[]
}

const emptyQuestion = (): DraftQ => ({
  key: newId(),
  orig: null,
  base: { n: 0, stimulus: '', stem: '', choices: [] },
  difficulty: '',
  stimulus: '',
  stem: '',
  choices: ['', '', '', ''],
  answer: '',
})

function draftFromRow(row: SetRow): Draft {
  return {
    title: row.title,
    subtitle: row.subtitle ?? '',
    skill: row.skills?.[0] ?? '',
    questions: row.questions.map((q, i) => ({
      key: newId(),
      orig: i,
      base: q,
      difficulty: q.difficulty ?? '',
      stimulus: q.stimulus ?? '',
      stem: q.stem ?? '',
      choices: LETTERS.map((l) => q.choices?.find((c) => c.letter === l)?.html ?? ''),
      answer: row.answers[i] ?? '',
    })),
  }
}

/** Вопрос в формате базы. clean — прогнать HTML через ту же санитизацию, что и при показе. */
function buildQuestion(d: DraftQ, n: number, clean = false): SetQuestion {
  const h = clean ? cleanForSave : (s: string) => s
  const q: SetQuestion = {
    ...d.base,
    n,
    stimulus: h(d.stimulus),
    stem: h(d.stem),
    choices: LETTERS.map((letter, i) => ({
      ...d.base.choices?.find((c) => c.letter === letter),
      letter,
      html: h(d.choices[i]),
    })),
  }
  if (d.difficulty || 'difficulty' in d.base) q.difficulty = d.difficulty
  return q
}

function buildFields(d: Draft, clean = false) {
  return {
    title: d.title.trim(),
    subtitle: d.subtitle.trim(),
    skills: d.skill ? [d.skill] : [],
    questions: d.questions.map((q, i) => buildQuestion(q, i + 1, clean)),
    answers: d.questions.map((q) => q.answer),
  }
}

/** «25 вопросов · 15 Easy, 10 Medium» — тот же формат, что у импорта (по нему рисуется полоска сложности). */
function materialNotes(prev: string, qs: SetQuestion[]): string {
  const counts = new Map<string, number>()
  for (const q of qs) counts.set(q.difficulty || '?', (counts.get(q.difficulty || '?') ?? 0) + 1)
  const mix = [...counts].map(([k, v]) => `${v} ${k}`).join(', ')
  const head = `${qs.length} ${plural(qs.length, 'вопрос', 'вопроса', 'вопросов')}${mix ? ` · ${mix}` : ''}`
  const rest = prev
    .split(' · ')
    .filter((p) => p && !/^\d+ вопрос/.test(p) && !/^\d+ (Easy|Medium|Hard|\?)(, \d+ (Easy|Medium|Hard|\?))*$/.test(p))
  return [head, ...rest].join(' · ')
}

function validate(d: Draft): { set: string[]; byQ: Map<string, string[]> } {
  const set: string[] = []
  if (!d.title.trim()) set.push('Нет названия сета')
  if (d.questions.length === 0) set.push('В сете нет ни одного вопроса')
  const byQ = new Map<string, string[]>()
  for (const q of d.questions) {
    const errs: string[] = []
    if (isBlankHtml(q.stem)) errs.push('нет формулировки вопроса')
    const empty = LETTERS.filter((_, i) => isBlankHtml(q.choices[i]))
    if (empty.length) errs.push(`пустые варианты: ${empty.join(', ')}`)
    if (!LETTERS.includes(q.answer as (typeof LETTERS)[number])) errs.push('не выбран правильный ответ')
    if (errs.length) byQ.set(q.key, errs)
  }
  return { set, byQ }
}

// ============================================================================

/** /sets/new — новый сет, /sets/:id/edit — правка. */
export function SetEditor() {
  const { id } = useParams()
  return <SetEditorLoader key={id ?? 'new'} id={id} />
}

interface Loaded {
  row: SetRow | null
  usage: SetUsage
}

function SetEditorLoader({ id }: { id?: string }) {
  const { sync } = useStore()
  const [params] = useSearchParams()
  const [loaded, setLoaded] = useState<Loaded | null | undefined>(id ? undefined : { row: null, usage: noUsage })
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id || !supabase) return
    const sb = supabase
    let cancelled = false
    Promise.all([fetchSetRow(sb, id), fetchSetUsage(sb, id)]).then(
      ([row, usage]) => !cancelled && setLoaded(row ? { row, usage } : null),
      (e: unknown) => !cancelled && setError(errText(e)),
    )
    return () => {
      cancelled = true
    }
  }, [id])

  const crumbs = <Crumbs setId={id} />
  if (sync.mode !== 'cloud' || !supabase) {
    return (
      <div className="page">
        {crumbs}
        <p className="muted">Редактор сетов работает в облачном режиме — после подключения Supabase.</p>
      </div>
    )
  }
  if (error) {
    return (
      <div className="page">
        {crumbs}
        <p className="error-text">Не удалось загрузить сет: {error}</p>
      </div>
    )
  }
  if (loaded === undefined) {
    return (
      <div className="page">
        {crumbs}
        <p className="muted">Загрузка…</p>
      </div>
    )
  }
  if (loaded === null) {
    return (
      <div className="page">
        {crumbs}
        <p className="muted">Сет не найден — возможно, он удалён.</p>
      </div>
    )
  }

  const skill = params.get('skill') ?? ''
  const initial: Draft = loaded.row
    ? draftFromRow(loaded.row)
    : {
        title: '',
        subtitle: '',
        skill: SKILLS.some((s) => s.id === skill) ? skill : '',
        questions: [emptyQuestion()],
      }
  return <EditorForm row={loaded.row} usage={loaded.usage} initial={initial} />
}

const noUsage: SetUsage = { total: 0, submitted: 0, inProgress: 0 }

function Crumbs({ setId, title }: { setId?: string; title?: string }) {
  return (
    <nav className="breadcrumbs">
      <Link to="/materials">Материалы</Link>
      <span>/</span>
      <Link to="/materials/questions">Вопросы по категориям</Link>
      <span>/</span>
      {setId && title && (
        <>
          <Link to={`/sets/${setId}`}>{title}</Link>
          <span>/</span>
        </>
      )}
    </nav>
  )
}

function usageText(u: SetUsage): string {
  const parts = [`${u.submitted} сдано`]
  if (u.inProgress) parts.push(`${u.inProgress} решается сейчас`)
  const waiting = u.total - u.submitted - u.inProgress
  if (waiting) parts.push(`${waiting} ещё не начато`)
  return `${u.total} ${plural(u.total, 'задание', 'задания', 'заданий')} (${parts.join(', ')})`
}

// ============================================================================

function EditorForm({ row, usage, initial }: { row: SetRow | null; usage: SetUsage; initial: Draft }) {
  const sb = supabase!
  const { db, dispatch } = useStore()
  const navigate = useNavigate()
  const [draft, setDraft] = useState<Draft>(initial)
  const [asCopy, setAsCopy] = useState(false)
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(initial.questions.length <= 5 ? initial.questions.map((q) => q.key) : []),
  )
  const [showErrors, setShowErrors] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [leaving, setLeaving] = useState(false)

  const isNew = row === null
  /** Сохраняем как новый сет: создание или «Сохранить как копию» */
  const creating = isNew || asCopy
  /** По сету есть задания — порядок и число вопросов менять нельзя */
  const locked = !creating && usage.total > 0

  const initialSnapshot = useMemo(() => JSON.stringify(buildFields(initial)), [initial])
  const snapshot = useMemo(() => JSON.stringify(buildFields(draft)), [draft])
  const dirty = !leaving && (snapshot !== initialSnapshot || asCopy)

  const structural =
    !isNew && (draft.questions.length !== row.questions.length || draft.questions.some((q, i) => q.orig !== i))
  const keyChanges = isNew
    ? []
    : draft.questions.flatMap((q, i) => (q.orig !== null && q.answer !== row.answers[q.orig] ? [i + 1] : []))

  const errors = useMemo(() => validate(draft), [draft])
  const errorCount = errors.set.length + errors.byQ.size

  useLeaveGuard(dirty)

  // --- правка черновика ---
  const setQ = (key: string, patch: Partial<DraftQ>) =>
    setDraft((d) => ({
      ...d,
      questions: d.questions.map((q) => (q.key === key ? { ...q, ...patch } : q)),
    }))

  const addQuestion = () => {
    const q = emptyQuestion()
    setDraft((d) => ({ ...d, questions: [...d.questions, q] }))
    setOpen((o) => new Set(o).add(q.key))
  }
  const duplicate = (key: string) => {
    const copy: DraftQ = {
      ...structuredClone(draft.questions.find((q) => q.key === key)!),
      key: newId(),
      orig: null,
    }
    setDraft((d) => {
      const i = d.questions.findIndex((q) => q.key === key)
      return {
        ...d,
        questions: [...d.questions.slice(0, i + 1), copy, ...d.questions.slice(i + 1)],
      }
    })
    setOpen((o) => new Set(o).add(copy.key))
  }
  const remove = (key: string, n: number) => {
    const q = draft.questions.find((x) => x.key === key)
    const blank = q && isBlankHtml(q.stem) && isBlankHtml(q.stimulus) && q.choices.every(isBlankHtml)
    if (!blank && !confirm(`Удалить вопрос ${n}?`)) return
    setDraft((d) => ({
      ...d,
      questions: d.questions.filter((x) => x.key !== key),
    }))
  }
  const move = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      const qs = d.questions.slice()
      const j = i + dir
      if (j < 0 || j >= qs.length) return d
      ;[qs[i], qs[j]] = [qs[j], qs[i]]
      return { ...d, questions: qs }
    })
  const toggle = (key: string) =>
    setOpen((o) => {
      const next = new Set(o)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const startCopy = () => {
    setAsCopy(true)
    setDraft((d) => ({
      ...d,
      title: d.title.endsWith('(копия)') ? d.title : `${d.title} (копия)`,
    }))
  }
  const cancelCopy = () => {
    setAsCopy(false)
    setDraft((d) => ({ ...d, title: d.title.replace(/ \(копия\)$/, '') }))
  }

  // --- сохранение ---
  const linked = row ? db.materials.filter((m) => m.setId === row.id) : []

  const onSave = async () => {
    setShowErrors(true)
    setSaveError('')
    if (errorCount > 0) {
      const first = draft.questions.find((q) => errors.byQ.has(q.key))
      if (first) {
        setOpen((o) => new Set(o).add(first.key))
        requestAnimationFrame(() =>
          document.getElementById(`q-${first.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
        )
      } else window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setSaving(true)
    try {
      const fields = buildFields(draft, true)
      let setId: string
      if (creating) {
        setId = newId()
        await insertSet(sb, setId, fields, asCopy && row ? row : undefined)
        const material: Material = {
          id: setId,
          title: fields.title,
          url: '',
          kind: 'practice',
          skills: fields.skills,
          notes: materialNotes('', fields.questions),
          createdAt: new Date().toISOString(),
          setId,
        }
        dispatch({ type: 'material/upsert', material })
      } else {
        setId = row.id
        // Задания могли выдать, пока сет был открыт в редакторе — проверяем заново.
        const fresh = await fetchSetUsage(sb, row.id)
        if (structural && fresh.total > 0) {
          throw new Error(
            `По сету уже выдано ${usageText(fresh)}. Добавлять, удалять и переставлять вопросы в нём нельзя — сохраните как копию.`,
          )
        }
        if (keyChanges.length && fresh.total > 0) {
          const ok = confirm(
            `Правильный ответ изменён в ${plural(keyChanges.length, 'вопросе', 'вопросах', 'вопросах')} № ${keyChanges.join(', ')}.\n\n` +
              `По сету выдано ${usageText(fresh)}.\n` +
              (fresh.submitted
                ? `Уже сданные (${fresh.submitted}) не пересчитываются: в их результатах остаётся проверка по старому ключу.\n`
                : '') +
              (fresh.total - fresh.submitted
                ? `Несданные (${fresh.total - fresh.submitted}) будут проверены по новому ключу.\n`
                : '') +
              '\nСохранить?',
          )
          if (!ok) return
        }
        await updateSet(sb, row.id, row.updated_at, fields)
        const mats = linked.length
          ? linked
          : [
              {
                id: row.id,
                url: '',
                kind: 'practice',
                notes: '',
                createdAt: new Date().toISOString(),
                setId: row.id,
              } as Material,
            ]
        for (const m of mats) {
          dispatch({
            type: 'material/upsert',
            material: {
              ...m,
              title: fields.title,
              skills: fields.skills,
              notes: materialNotes(m.notes, fields.questions),
            },
          })
        }
      }
      setLeaving(true)
      navigate(`/sets/${setId}`)
    } catch (e) {
      setSaveError(e instanceof SetConflictError ? e.message : `Не удалось сохранить: ${errText(e)}`)
    } finally {
      setSaving(false)
    }
  }

  const onCancel = () => {
    if (dirty && !confirm('Есть несохранённые изменения. Выйти без сохранения?')) return
    setLeaving(true)
    navigate(row ? `/sets/${row.id}` : '/materials/questions')
  }

  const allOpen = draft.questions.length > 0 && draft.questions.every((q) => open.has(q.key))

  return (
    <div className="page set-editor">
      <Crumbs setId={row?.id} title={row?.title} />
      <div className="page-head">
        <h1>{isNew ? 'Новый сет' : asCopy ? 'Копия сета' : 'Редактирование сета'}</h1>
      </div>

      {asCopy && (
        <div className="se-note">
          <CopyPlus size={16} aria-hidden="true" />
          <span>
            Сохранится <strong>новый сет</strong> со всеми правками; исходный «{row?.title}» и задания по нему не
            изменятся.
          </span>
          {!(structural && usage.total > 0) && (
            <button className="btn btn-small" type="button" onClick={cancelCopy}>
              Править исходный
            </button>
          )}
        </div>
      )}

      {locked && (
        <div className="se-note se-warn">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>
            По этому сету выдано {usageText(usage)}. Результаты хранят ответы по номерам вопросов, поэтому здесь можно
            править текст, варианты, сложность и ключ, но нельзя добавлять, удалять и переставлять вопросы. Для этого —
            сохраните как копию.
          </span>
          <button className="btn btn-small" type="button" onClick={startCopy}>
            <CopyPlus size={14} aria-hidden="true" /> Сохранить как копию
          </button>
        </div>
      )}

      <section className="card form">
        <div className="field-row">
          <label className="field grow-2">
            <span>Название *</span>
            <input
              className={`input ${showErrors && !draft.title.trim() ? 'is-invalid' : ''}`}
              placeholder="Напр. «Boundaries — Set 12»"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              autoFocus={isNew}
            />
          </label>
          <label className="field">
            <span>Навык</span>
            <select
              className="input"
              value={draft.skill}
              onChange={(e) => setDraft({ ...draft, skill: e.target.value })}
            >
              <option value="">Без категории</option>
              {DOMAINS.map((d) => (
                <optgroup key={d.id} label={d.name}>
                  {d.skills.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              ))}
              {draft.skill && !SKILLS.some((s) => s.id === draft.skill) && (
                <option value={draft.skill}>{skillName(draft.skill)}</option>
              )}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Подзаголовок</span>
          <input
            className="input"
            placeholder="Напр. «Medium–Hard · пунктуация между предложениями»"
            value={draft.subtitle}
            onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
          />
        </label>
      </section>

      <div className="se-qhead">
        <h2>
          Вопросы <span className="muted">{draft.questions.length}</span>
        </h2>
        {draft.questions.length > 0 && (
          <button
            type="button"
            className="link-btn"
            onClick={() => setOpen(allOpen ? new Set() : new Set(draft.questions.map((q) => q.key)))}
          >
            {allOpen ? 'Свернуть все' : 'Развернуть все'}
          </button>
        )}
      </div>

      <div className="se-list">
        {draft.questions.map((q, i) => (
          <QuestionCard
            key={q.key}
            q={q}
            n={i + 1}
            count={draft.questions.length}
            isOpen={open.has(q.key)}
            locked={locked}
            keyChanged={!isNew && !asCopy && q.orig !== null && q.answer !== row.answers[q.orig]}
            errors={showErrors ? errors.byQ.get(q.key) : undefined}
            onToggle={() => toggle(q.key)}
            onChange={(patch) => setQ(q.key, patch)}
            onMove={(dir) => move(i, dir)}
            onDuplicate={() => duplicate(q.key)}
            onRemove={() => remove(q.key, i + 1)}
          />
        ))}
      </div>

      {!locked && (
        <button type="button" className="btn se-add" onClick={addQuestion}>
          <Plus size={16} aria-hidden="true" /> Добавить вопрос
        </button>
      )}

      {!creating && row && (
        <DangerZone setId={row.id} title={row.title} materials={linked} onDeleted={() => setLeaving(true)} />
      )}

      <div className="se-bar">
        <div className="se-bar-status small">
          {saveError ? (
            <span className="error-text">{saveError}</span>
          ) : showErrors && errorCount > 0 ? (
            <span className="error-text">
              {[
                ...errors.set,
                errors.byQ.size
                  ? `${plural(errors.byQ.size, 'Вопрос', 'Вопросы', 'Вопросы')} ${draft.questions
                      .flatMap((q, i) => (errors.byQ.has(q.key) ? [i + 1] : []))
                      .join(', ')} ${errors.byQ.size === 1 ? 'не заполнен' : 'не заполнены'} до конца`
                  : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          ) : dirty ? (
            <span className="muted">
              Есть несохранённые изменения
              {keyChanges.length > 0 &&
                !creating &&
                usage.total > 0 &&
                ' · изменён ключ в вопросах с выданными заданиями'}
            </span>
          ) : (
            <span className="muted">Изменений нет</span>
          )}
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={onCancel}>
            Отмена
          </button>
          {!creating && !locked && (
            <button type="button" className="btn" onClick={startCopy} title="Сохранить правки как новый сет">
              <CopyPlus size={15} aria-hidden="true" /> Как копию
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void onSave()}
            disabled={saving || (!dirty && !creating)}
          >
            <Save size={15} aria-hidden="true" />
            {saving ? 'Сохраняю…' : creating ? 'Создать сет' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================

function QuestionCard(props: {
  q: DraftQ
  n: number
  count: number
  isOpen: boolean
  locked: boolean
  keyChanged: boolean
  errors?: string[]
  onToggle: () => void
  onChange: (patch: Partial<DraftQ>) => void
  onMove: (dir: -1 | 1) => void
  onDuplicate: () => void
  onRemove: () => void
}) {
  const { q, n, locked } = props
  const preview = useMemo(() => buildQuestion(q, n), [q, n])
  const summary = useMemo(
    () => (props.isOpen ? '' : htmlToText(q.stem) || htmlToText(q.stimulus) || 'Пустой вопрос'),
    [props.isOpen, q.stem, q.stimulus],
  )
  const lockTitle = locked ? 'Недоступно: по сету выданы задания' : undefined

  return (
    <article id={`q-${q.key}`} className={`card se-q ${props.errors ? 'has-errors' : ''}`}>
      <header className="se-q-head">
        <button type="button" className="se-q-toggle" onClick={props.onToggle} aria-expanded={props.isOpen}>
          {props.isOpen ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
          <span className="se-q-num">{n}</span>
        </button>

        <div className="seg" role="radiogroup" aria-label={`Сложность вопроса ${n}`}>
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={q.difficulty === d}
              className={`seg-btn seg-${d.toLowerCase()} ${q.difficulty === d ? 'is-on' : ''}`}
              onClick={() => props.onChange({ difficulty: q.difficulty === d ? '' : d })}
            >
              {d}
            </button>
          ))}
        </div>

        <div className="se-key">
          <span className="small muted">Ответ</span>
          <div className="seg" role="radiogroup" aria-label={`Правильный ответ на вопрос ${n}`}>
            {LETTERS.map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={q.answer === l}
                className={`seg-btn seg-key ${q.answer === l ? 'is-on' : ''}`}
                onClick={() => props.onChange({ answer: l })}
              >
                {l}
              </button>
            ))}
          </div>
          {props.keyChanged && (
            <span className="se-badge" title="Ключ отличается от сохранённого">
              ключ изменён
            </span>
          )}
        </div>

        {!props.isOpen && <span className="se-q-summary muted small">{summary}</span>}

        <div className="se-q-actions">
          <button
            type="button"
            className="icon-btn icon-edit"
            title={lockTitle ?? 'Выше'}
            disabled={locked || n === 1}
            onClick={() => props.onMove(-1)}
          >
            <ArrowUp size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-btn icon-edit"
            title={lockTitle ?? 'Ниже'}
            disabled={locked || n === props.count}
            onClick={() => props.onMove(1)}
          >
            <ArrowDown size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-btn icon-edit"
            title={lockTitle ?? 'Дублировать'}
            disabled={locked}
            onClick={props.onDuplicate}
          >
            <Copy size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-btn"
            title={lockTitle ?? 'Удалить вопрос'}
            disabled={locked}
            onClick={props.onRemove}
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
      </header>

      {props.errors && <p className="error-text small se-q-errors">{props.errors.join(' · ')}</p>}

      {props.isOpen && (
        <div className="se-q-body">
          <div className="se-q-fields">
            <RichField
              label="Текст (стимул)"
              value={q.stimulus}
              onChange={(stimulus) => props.onChange({ stimulus })}
              contentClass="setq-stimulus"
              placeholder="Отрывок, на который опирается вопрос. Можно оставить пустым."
              allowTable
            />
            <RichField
              label="Вопрос *"
              value={q.stem}
              onChange={(stem) => props.onChange({ stem })}
              contentClass="setq-stem"
              placeholder="Which choice completes the text…"
              invalid={Boolean(props.errors) && isBlankHtml(q.stem)}
            />
            <div className="se-choices">
              {LETTERS.map((l, i) => (
                <RichField
                  key={l}
                  label={`Вариант ${l} *`}
                  value={q.choices[i]}
                  onChange={(html) =>
                    props.onChange({
                      choices: q.choices.map((c, j) => (j === i ? html : c)),
                    })
                  }
                  contentClass="setq-ct"
                  compact
                  invalid={Boolean(props.errors) && isBlankHtml(q.choices[i])}
                  prefix={
                    <button
                      type="button"
                      className={`se-ltr ${q.answer === l ? 'is-key' : ''}`}
                      title={q.answer === l ? 'Правильный ответ' : 'Сделать правильным ответом'}
                      aria-pressed={q.answer === l}
                      onClick={() => props.onChange({ answer: l })}
                    >
                      {l}
                    </button>
                  }
                />
              ))}
            </div>
          </div>
          <div className="se-q-preview">
            <div className="small muted se-preview-label">Как увидит ученик (с отметкой ответа)</div>
            <div className="paper">
              <QuestionView q={preview} correct={q.answer || undefined} showDifficulty />
            </div>
          </div>
        </div>
      )}
    </article>
  )
}

// ============================================================================

function DangerZone(props: { setId: string; title: string; materials: Material[]; onDeleted: () => void }) {
  const sb = supabase!
  const { dispatch } = useStore()
  const navigate = useNavigate()
  const [usage, setUsage] = useState<SetUsage | null>(null)
  const [ack, setAck] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const ask = async () => {
    setError('')
    setBusy(true)
    try {
      setUsage(await fetchSetUsage(sb, props.setId))
      setAck(false)
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const onDelete = async () => {
    setBusy(true)
    setError('')
    try {
      await deleteSet(sb, props.setId)
      for (const m of props.materials) dispatch({ type: 'material/delete', id: m.id })
      props.onDeleted()
      navigate('/materials/questions')
    } catch (e) {
      setError(`Не удалось удалить: ${errText(e)}`)
      setBusy(false)
    }
  }

  const needsAck = Boolean(usage && usage.total > 0)

  return (
    <section className="card se-danger">
      <div className="row spread">
        <div>
          <h2>Удалить сет</h2>
          <p className="muted small">Сет и его карточка в «Материалах» удалятся безвозвратно.</p>
        </div>
        {!usage && (
          <button type="button" className="btn btn-danger" onClick={() => void ask()} disabled={busy}>
            <Trash2 size={15} aria-hidden="true" /> Удалить…
          </button>
        )}
      </div>
      {usage && (
        <div className="se-danger-confirm">
          {usage.total > 0 ? (
            <>
              <p>
                <AlertTriangle size={15} aria-hidden="true" className="se-inline-icon" /> По сету выдано{' '}
                <strong>{usageText(usage)}</strong>. Вместе с сетом удалятся все эти задания
                {usage.submitted > 0 && ' и результаты учеников'}, ссылки у учеников перестанут работать.
              </p>
              <label className="row small">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                Понимаю, что {usage.submitted > 0 ? 'результаты учеников будут потеряны' : 'задания будут удалены'}
              </label>
            </>
          ) : (
            <p>Заданий по этому сету нет. Удалить «{props.title}»?</p>
          )}
          <div className="row">
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => void onDelete()}
              disabled={busy || (needsAck && !ack)}
            >
              {busy ? 'Удаляю…' : 'Удалить навсегда'}
            </button>
            <button type="button" className="btn" onClick={() => setUsage(null)} disabled={busy}>
              Отмена
            </button>
          </div>
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
    </section>
  )
}

// ============================================================================

/**
 * Защита несохранённых правок: закрытие/перезагрузка вкладки и клики по ссылкам внутри CRM.
 * (HashRouter не поддерживает useBlocker, поэтому перехватываем клики сами.)
 */
function useLeaveGuard(active: boolean) {
  const activeRef = useRef(active)
  useEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (activeRef.current) e.preventDefault()
    }
    const onClick = (e: MouseEvent) => {
      if (!activeRef.current || e.defaultPrevented || e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]')
      if (!a || a.getAttribute('target') === '_blank') return
      if (!confirm('Есть несохранённые изменения. Уйти без сохранения?')) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('click', onClick, true)
    }
  }, [])
}
