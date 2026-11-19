import { X } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { SetSelectOptions } from '../components/Assignments'
import { formatDate, today } from '../dates'
import { emptyPlan, newId } from '../db'
import { OUTCOME_LABELS } from '../lessons'
import { SKILLS } from '../sat'
import { createAssignment, listAssignments } from '../sets'
import { supabase } from '../supabase'
import type { Assignment, Lesson, LessonOutcome, LessonPlan, LessonTemplate, Material } from '../types'
import { useStore } from '../useStore'
import '../lessons.css'

// Конструктор урока. Порядок блоков — обратный дизайн: сначала цель и «хороший результат»,
// затем теория, практика от совместной к самостоятельной, ДЗ и итог после урока.
// Тот же редактор правит заготовки (mode = 'template'): без ученика, даты и итога.

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

interface Draft {
  studentId: string
  date: string
  duration: string
  paid: boolean
  topics: string[]
  homework: string
  notes: string
  plan: LessonPlan
}

const draftFromTemplate = (t: LessonTemplate, base?: Draft): Draft => ({
  studentId: base?.studentId ?? '',
  date: base?.date ?? today(),
  paid: base?.paid ?? false,
  notes: base?.notes ?? '',
  duration: String(t.durationMin),
  topics: t.skills,
  homework: t.homework,
  plan: { ...t.plan, outcome: '', homeworkDue: '', templateId: t.id },
})

/** Новый ключ на каждый урок или заготовку: черновик не переезжает с одной страницы на другую. */
export function LessonEditor({ mode }: { mode: 'lesson' | 'template' }) {
  const { id } = useParams()
  return <Editor key={`${mode}:${id ?? 'new'}`} mode={mode} />
}

function Editor({ mode }: { mode: 'lesson' | 'template' }) {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { db, dispatch, sync } = useStore()
  const navigate = useNavigate()
  const location = useLocation()
  const isTemplate = mode === 'template'

  const lesson = !isTemplate && id ? db.lessons.find((l) => l.id === id) : undefined
  const template = isTemplate && id ? db.lessonTemplates.find((t) => t.id === id) : undefined
  const templates = db.lessonTemplates

  const [draft, setDraft] = useState<Draft>(() => {
    if (lesson) {
      return {
        studentId: lesson.studentId,
        date: lesson.date,
        duration: String(lesson.durationMin),
        paid: lesson.paid,
        topics: lesson.topics,
        homework: lesson.homework,
        notes: lesson.notes,
        plan: lesson.plan ?? emptyPlan(),
      }
    }
    if (template) return draftFromTemplate(template)
    const blank: Draft = {
      studentId: params.get('student') ?? '',
      date: today(),
      duration: '60',
      paid: false,
      topics: [],
      homework: '',
      notes: '',
      plan: emptyPlan(),
    }
    const from = templates.find((t) => t.id === params.get('template'))
    return from ? draftFromTemplate(from, blank) : blank
  })
  // после первого сохранения нового урока страница открывается заново по адресу урока
  const [saved, setSaved] = useState(() => (location.state as { saved?: string } | null)?.saved ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [allSets, setAllSets] = useState(false)
  // задания ученика (облако): по ним видно, какие домашние сеты уже выданы и сданы
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [reloadKey, setReloadKey] = useState(0)

  const cloud = sync.mode === 'cloud' && Boolean(supabase)
  useEffect(() => {
    if (!cloud || !supabase || isTemplate || !draft.studentId) return
    let cancelled = false
    listAssignments(supabase, draft.studentId).then(
      (list) => !cancelled && setAssignments(list),
      () => !cancelled && setAssignments([]),
    )
    return () => {
      cancelled = true
    }
  }, [cloud, isTemplate, draft.studentId, reloadKey])

  // урок или заготовка из адреса не найдены (удалены)
  if (id && !lesson && !template) {
    return <Navigate to={isTemplate ? '/lessons/templates' : '/lessons'} replace />
  }

  const set = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setSaved('')
  }
  const setPlan = (patch: Partial<LessonPlan>) => set({ plan: { ...draft.plan, ...patch } })
  const toggleTopic = (skill: string) =>
    set({ topics: draft.topics.includes(skill) ? draft.topics.filter((t) => t !== skill) : [...draft.topics, skill] })

  const sets = db.materials
    .filter((m) => m.setId)
    .sort((a, b) => a.title.localeCompare(b.title, 'ru', { numeric: true }))
  const byTopic = sets.filter((m) => m.skills.some((s) => draft.topics.includes(s)))
  const offered = !allSets && byTopic.length > 0 ? byTopic : sets

  const lessonId = lesson?.id
  const issued = (setId: string) => assignments.find((a) => a.setId === setId && a.lessonId === lessonId)
  const solvedBefore = (setId: string) => assignments.some((a) => a.setId === setId && a.submittedAt)

  const applyTemplate = (templateId: string) => {
    const t = templates.find((x) => x.id === templateId)
    if (!t) return
    const p = draft.plan
    const filled = p.title || p.goals || p.success || p.theory || p.practice || draft.homework
    if (filled && !confirm('Заменить тему, цели, теорию, практику и ДЗ содержимым заготовки?')) return
    setDraft((d) => ({ ...draftFromTemplate(t, d), plan: { ...draftFromTemplate(t, d).plan, outcome: d.plan.outcome } }))
    setSaved('')
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    const durationMin = Math.max(0, Number(draft.duration) || 0)
    const plan: LessonPlan = { ...draft.plan, title: draft.plan.title.trim() }

    if (isTemplate) {
      const tid = template?.id ?? newId()
      dispatch({
        type: 'template/upsert',
        template: {
          id: tid,
          skills: draft.topics,
          durationMin,
          homework: draft.homework.trim(),
          plan: { ...plan, outcome: '', homeworkDue: '', templateId: '' },
          createdAt: template?.createdAt ?? new Date().toISOString(),
        },
      })
      navigate('/lessons/templates')
      return
    }

    if (!draft.studentId) {
      setError('Выберите ученика.')
      return
    }
    const next: Lesson = {
      id: lessonId ?? newId(),
      studentId: draft.studentId,
      date: draft.date,
      durationMin,
      topics: draft.topics,
      homework: draft.homework.trim(),
      notes: draft.notes.trim(),
      paid: draft.paid,
      plan,
    }
    dispatch({ type: 'lesson/upsert', lesson: next })

    // домашние сеты становятся заданиями ученика (каждый — один раз на урок)
    let created = 0
    if (cloud && supabase) {
      setBusy(true)
      try {
        const current = await listAssignments(supabase, next.studentId)
        for (const setId of plan.homeworkSetIds) {
          if (current.some((a) => a.setId === setId && a.lessonId === next.id)) continue
          await createAssignment(supabase, next.studentId, setId, plan.homeworkDue, next.id)
          created += 1
        }
      } catch (err) {
        setError(`Урок сохранён, но выдать задания не удалось: ${errText(err)}`)
      } finally {
        setBusy(false)
      }
    }
    const message = created ? `Сохранено · выдано заданий: ${created}` : 'Сохранено'
    setSaved(message)
    setReloadKey((k) => k + 1)
    if (!lessonId) navigate(`/lessons/${next.id}`, { replace: true, state: { saved: message } })
  }

  const saveAsTemplate = () => {
    dispatch({
      type: 'template/upsert',
      template: {
        id: newId(),
        skills: draft.topics,
        durationMin: Math.max(0, Number(draft.duration) || 0),
        homework: draft.homework.trim(),
        plan: { ...draft.plan, outcome: '', homeworkDue: '', templateId: '' },
        createdAt: new Date().toISOString(),
      },
    })
    setSaved('Заготовка сохранена — она в разделе «Уроки → Заготовки»')
  }

  const onDelete = () => {
    if (lesson && confirm('Удалить урок? Выданные задания останутся у ученика.')) {
      dispatch({ type: 'lesson/delete', id: lesson.id })
      navigate('/lessons')
    }
    if (template && confirm('Удалить заготовку?')) {
      dispatch({ type: 'template/delete', id: template.id })
      navigate('/lessons/templates')
    }
  }

  const student = db.students.find((s) => s.id === draft.studentId)
  const heading = isTemplate
    ? template
      ? 'Заготовка урока'
      : 'Новая заготовка'
    : lesson
      ? `Урок · ${formatDate(lesson.date)}`
      : 'Новый урок'
  const source = templates.find((t) => t.id === draft.plan.templateId)

  return (
    <div className="page lesson-editor">
      <Link className="back" to={isTemplate ? '/lessons/templates' : '/lessons'}>
        ← {isTemplate ? 'Заготовки' : 'Уроки'}
      </Link>
      <div className="page-head">
        <h1>{heading}</h1>
        {student && !isTemplate && (
          <Link className="btn" to={`/students/${student.id}`}>
            {student.name}
          </Link>
        )}
      </div>

      <form className="le-form" onSubmit={onSubmit}>
        {!isTemplate && (
          <section className="card">
            <div className="field-row">
              <label className="field grow-2">
                <span>Ученик</span>
                <select
                  className="input"
                  value={draft.studentId}
                  onChange={(e) => set({ studentId: e.target.value })}
                  disabled={Boolean(lesson)}
                  required
                >
                  <option value="">Выберите ученика…</option>
                  {db.students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Дата</span>
                <input className="input" type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} required />
              </label>
              <label className="field">
                <span>Длительность, мин</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step={15}
                  value={draft.duration}
                  onChange={(e) => set({ duration: e.target.value })}
                />
              </label>
              <label className="field checkbox">
                <input type="checkbox" checked={draft.paid} onChange={(e) => set({ paid: e.target.checked })} />
                <span>Оплачен</span>
              </label>
            </div>
            {templates.length > 0 && (
              <label className="field">
                <span>Собрать из заготовки</span>
                <select className="input" value="" onChange={(e) => applyTemplate(e.target.value)}>
                  <option value="">{source ? `Сейчас: ${source.plan.title}` : 'С нуля — или выберите заготовку…'}</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.plan.title || 'Без названия'}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </section>
        )}

        <Block n={1} title="Тема" hint="О чём урок — одной строкой. Навыки ниже попадут в «Пройденные темы» ученика.">
          <input
            className="input"
            placeholder="Например: Transitions — логическая связка между предложениями"
            value={draft.plan.title}
            onChange={(e) => setPlan({ title: e.target.value })}
            required={isTemplate}
          />
          <div className="chips">
            {SKILLS.map((s) => (
              <button
                type="button"
                key={s.id}
                className={`chip ${draft.topics.includes(s.id) ? 'chip-on' : ''}`}
                onClick={() => toggleTopic(s.id)}
              >
                {s.name}
              </button>
            ))}
          </div>
          {isTemplate && (
            <label className="field le-narrow">
              <span>Длительность, мин</span>
              <input
                className="input"
                type="number"
                min={0}
                step={15}
                value={draft.duration}
                onChange={(e) => set({ duration: e.target.value })}
              />
            </label>
          )}
        </Block>

        <Block n={2} title="Цели урока" hint="Что ученик сможет делать после урока. По строке на цель, 2–3 цели, каждая начинается с глагола.">
          <Area
            rows={3}
            placeholder={'Определяет отношение между предложениями до чтения вариантов\nРазличает близкие связки внутри одной группы'}
            value={draft.plan.goals}
            onChange={(v) => setPlan({ goals: v })}
          />
        </Block>

        <Block
          n={3}
          title="Хороший результат"
          hint="По чему в конце урока будет видно, что цель достигнута. Лучше измеримо: сколько верных, за какое время, без подсказок."
        >
          <Area
            rows={2}
            placeholder="Не меньше 8 из 10 верно в самостоятельной части, без подсказок"
            value={draft.plan.success}
            onChange={(v) => setPlan({ success: v })}
          />
        </Block>

        <Block n={4} title="Теория" hint="Что объясняем: правило, алгоритм по шагам, типичные ловушки. Ученик увидит это в своём кабинете.">
          <Area rows={6} placeholder="Шаги, правила, примеры, ловушки…" value={draft.plan.theory} onChange={(v) => setPlan({ theory: v })} />
        </Block>

        <Block
          n={5}
          title="Практика на уроке"
          hint="От совместной к самостоятельной: показываю сам → ученик решает с подсказкой → решает сам. Ниже — сеты, которые берём на урок."
        >
          <Area rows={5} placeholder="Разминка → вместе → с подсказкой → сам → итог" value={draft.plan.practice} onChange={(v) => setPlan({ practice: v })} />
          <SetPicker
            label="Сеты на уроке"
            ids={draft.plan.practiceSetIds}
            onChange={(ids) => setPlan({ practiceSetIds: ids })}
            sets={sets}
            offered={offered}
            note={(setId) => (solvedBefore(setId) ? 'уже решал' : '')}
          />
        </Block>

        <Block
          n={6}
          title="Домашнее задание"
          hint={
            isTemplate
              ? 'Текст задания и сеты по умолчанию — их можно поменять в уроке.'
              : 'Текст увидит ученик. Сеты после сохранения урока станут его заданиями — они появятся в кабинете ученика.'
          }
        >
          <Area rows={2} placeholder="Что сделать дома" value={draft.homework} onChange={(v) => set({ homework: v })} />
          <SetPicker
            label="Сеты на дом"
            ids={draft.plan.homeworkSetIds}
            onChange={(ids) => setPlan({ homeworkSetIds: ids })}
            sets={sets}
            offered={offered}
            note={(setId) => {
              if (isTemplate) return ''
              const a = issued(setId)
              if (a?.submittedAt) return `сдано ${a.correctCount ?? 0} из ${a.totalCount ?? 0}`
              if (a) return 'выдано'
              if (!cloud) return 'задания работают в облачном режиме'
              return solvedBefore(setId) ? 'уже решал · будет выдано при сохранении' : 'будет выдано при сохранении'
            }}
          />
          {!isTemplate && draft.plan.homeworkSetIds.length > 0 && (
            <label className="field le-narrow">
              <span>Сдать до</span>
              <input
                className="input"
                type="date"
                value={draft.plan.homeworkDue}
                onChange={(e) => setPlan({ homeworkDue: e.target.value })}
              />
            </label>
          )}
          {sets.length > byTopic.length && byTopic.length > 0 && (
            <button type="button" className="link-btn" onClick={() => setAllSets((v) => !v)}>
              {allSets ? 'Показывать только сеты по темам урока' : 'Показывать все сеты, не только по темам урока'}
            </button>
          )}
        </Block>

        {!isTemplate && (
          <Block n={7} title="Итог урока" hint="Заполняется после урока. Заметки видите только вы.">
            <div className="field">
              <span>Хороший результат</span>
              <div className="chips">
                {(Object.keys(OUTCOME_LABELS) as Exclude<LessonOutcome, ''>[]).map((o) => (
                  <button
                    type="button"
                    key={o}
                    className={`chip ${draft.plan.outcome === o ? `chip-on le-outcome-${o}` : ''}`}
                    onClick={() => setPlan({ outcome: draft.plan.outcome === o ? '' : o })}
                  >
                    {OUTCOME_LABELS[o]}
                  </button>
                ))}
              </div>
            </div>
            <Area rows={3} placeholder="Что получилось, что нет, что взять на следующий урок" value={draft.notes} onChange={(v) => set({ notes: v })} />
          </Block>
        )}

        <div className="le-actions">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Сохраняю…' : isTemplate ? 'Сохранить заготовку' : 'Сохранить урок'}
          </button>
          {!isTemplate && (
            <button className="btn" type="button" onClick={saveAsTemplate}>
              Сохранить как заготовку
            </button>
          )}
          {saved && <span className="le-saved">{saved}</span>}
          {(lesson || template) && (
            <button className="btn btn-danger push-right" type="button" onClick={onDelete}>
              Удалить
            </button>
          )}
        </div>
        {error && <p className="error-text">{error}</p>}
      </form>
    </div>
  )
}

function Block({ n, title, hint, children }: { n: number; title: string; hint: string; children: ReactNode }) {
  return (
    <section className="card le-block">
      <div className="le-block-head">
        <span className="le-num" aria-hidden="true">
          {n}
        </span>
        <div>
          <h2>{title}</h2>
          <p className="muted small">{hint}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

function Area(props: { rows: number; placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <textarea
      className="input"
      rows={props.rows}
      placeholder={props.placeholder}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
    />
  )
}

/** Список выбранных сетов и выпадающий список, чтобы добавить ещё. */
function SetPicker(props: {
  label: string
  ids: string[]
  onChange: (ids: string[]) => void
  /** Все сеты библиотеки (для названий) */
  sets: Material[]
  /** Сеты, предлагаемые к добавлению */
  offered: Material[]
  note: (setId: string) => string
}) {
  if (props.sets.length === 0) {
    return <p className="muted small">{props.label}: в библиотеке пока нет сетов (они появляются в облачном режиме).</p>
  }
  const titleOf = (id: string) => props.sets.find((m) => m.setId === id)?.title ?? 'Сет удалён из библиотеки'
  return (
    <div className="field">
      <span>{props.label}</span>
      {props.ids.length > 0 && (
        <ul className="le-sets">
          {props.ids.map((id) => {
            const note = props.note(id)
            return (
              <li key={id}>
                <Link to={`/sets/${id}`} target="_blank">
                  {titleOf(id)}
                </Link>
                {note && <span className="muted small">{note}</span>}
                <button
                  type="button"
                  className="icon-btn push-right"
                  title="Убрать из урока"
                  onClick={() => props.onChange(props.ids.filter((x) => x !== id))}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <select
        className="input"
        value=""
        onChange={(e) => e.target.value && props.onChange([...props.ids, e.target.value])}
      >
        <option value="">Добавить сет…</option>
        <SetSelectOptions sets={props.offered.filter((m) => !props.ids.includes(m.setId!))} />
      </select>
    </div>
  )
}
