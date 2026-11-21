import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../supabase'
import {
  BLANK,
  SKILL_TITLES,
  buildExercise,
  exerciseKind,
  grammarCloudBackend,
  nextStage,
  pickItem,
  type Exercise,
  type GrammarBackend,
  type GrammarRule,
  type GrammarSession,
} from '../grammar'
import { plural } from '../vocab'
import { PortalBack } from '../portal/PortalBack'
import { grammarDemoBackend } from './demo'
import '../vocab/vocab.css'
import './grammar.css'

// Тренер грамматики для ученика: постоянная ссылка #/grammar/<token>, без входа.
// #/grammar/demo — демо с несколькими правилами, прогресс хранится в браузере.

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const rulesWord = (n: number) => plural(n, 'правило', 'правила', 'правил')
const SAT_STEM = 'Which choice completes the text so that it conforms to the conventions of Standard English?'

export function GrammarApp({ token }: { token: string }) {
  const backend = useMemo<GrammarBackend | null>(
    () => (token === 'demo' ? grammarDemoBackend : supabase ? grammarCloudBackend(supabase, token) : null),
    [token],
  )
  if (!backend) {
    return (
      <Shell>
        <div className="solve-card">
          <h1>Сервис ещё не настроен</h1>
          <p>Напишите преподавателю — ссылка заработает после настройки.</p>
        </div>
      </Shell>
    )
  }
  return <Grammar backend={backend} demo={token === 'demo'} />
}

function Shell({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.title = 'Грамматика — SAT Verbal'
  }, [])
  return <div className="solve">{children}</div>
}

/** Текст с **выделением** (знаки препинания в примерах). */
function Rich({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return (
    <>
      {parts.map((p, i) => (i % 2 ? <strong key={i} className="gr-mark">{p}</strong> : <Fragment key={i}>{p}</Fragment>))}
    </>
  )
}

/** Элемент очереди: карточка правила или упражнение по нему. */
interface Entry {
  key: number
  rule: GrammarRule
  recent: string[]
  intro: boolean
  kind: Exercise['kind']
  stage: number
  seed: number
  /** Упражнение правила ('' — карточка правила) */
  itemId: string
  /** Первая попытка по правилу за сессию (для точности) */
  first: boolean
}

/** Упражнения, уже показанные в сессии: id правила → id упражнений. */
type Used = Map<string, Set<string>>

/** Подбирает упражнение для элемента очереди и отмечает его показанным; null — у правила нет упражнений. */
function withItem(e: Omit<Entry, 'itemId'>, used: Used): Entry | null {
  const ids = used.get(e.rule.id) ?? new Set<string>()
  const item = pickItem(e.rule, e.stage, e.recent, ids, e.seed)
  if (!item) return null
  ids.add(item.id)
  used.set(e.rule.id, ids)
  return { ...e, itemId: item.id }
}

interface Summary {
  rules: number
  firstTotal: number
  firstCorrect: number
  newRules: number
  mistakes: string[]
}

const seed = () => Math.floor(Math.random() * 0xffffffff)

function shuffle<T>(items: T[]): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Повторения вперемешку (так правила чередуются, как на экзамене), карточки новых — между ними. */
function buildQueue(s: GrammarSession, used: Used): Entry[] {
  let key = 0
  const reviews: Entry[] = shuffle(s.due).flatMap((r) => {
    const e = withItem(
      { key: key++, rule: r, recent: r.recent ?? [], intro: false, kind: exerciseKind(r.stage), stage: r.stage, seed: seed(), first: true },
      used,
    )
    return e ? [e] : []
  })
  const intros: Entry[] = s.fresh
    .filter((r) => r.items.length > 0)
    .map((r) => ({ key: key++, rule: r, recent: [], intro: true, kind: 'cued', stage: 0, seed: seed(), itemId: '', first: true }))
  const step = Math.max(2, Math.ceil(reviews.length / (intros.length + 1)))
  const out: Entry[] = []
  reviews.forEach((r, i) => {
    out.push(r)
    const next = (i + 1) % step === 0 ? intros.shift() : undefined
    if (next) out.push(next)
  })
  return [...out, ...intros]
}

type Phase = 'loading' | 'missing' | 'error' | 'home' | 'session' | 'done'

function Grammar({ backend, demo }: { backend: GrammarBackend; demo: boolean }) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [session, setSession] = useState<GrammarSession | null>(null)
  const [queue, setQueue] = useState<Entry[]>([])
  const [used, setUsed] = useState<Used>(() => new Map())
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState('')
  const [loadKey, setLoadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    backend.session().then(
      (s) => {
        if (cancelled) return
        setSession(s)
        setPhase(s ? 'home' : 'missing')
      },
      (e: unknown) => {
        if (cancelled) return
        setError(errText(e))
        setPhase('error')
      },
    )
    return () => {
      cancelled = true
    }
  }, [backend, loadKey])

  const reload = () => {
    setPhase('loading')
    setLoadKey((k) => k + 1)
  }

  if (phase === 'loading') {
    return (
      <Shell>
        <p className="solve-muted">Загрузка…</p>
      </Shell>
    )
  }
  if (phase === 'missing') {
    return (
      <Shell>
        <div className="solve-card">
          <h1>Ссылка не найдена</h1>
          <p>Проверьте ссылку или попросите преподавателя прислать её ещё раз.</p>
        </div>
      </Shell>
    )
  }
  if (phase === 'error' || !session) {
    return (
      <Shell>
        <div className="solve-card">
          <h1>Не удалось загрузить тренер</h1>
          <p className="solve-error">{error}</p>
          <button className="sbtn sbtn-primary" onClick={reload}>
            Попробовать ещё раз
          </button>
        </div>
      </Shell>
    )
  }

  if (phase === 'session') {
    return (
      <Shell>
        <Trainer
          backend={backend}
          initial={queue}
          used={used}
          onFinish={(s) => {
            setSummary(s)
            setPhase('done')
          }}
        />
      </Shell>
    )
  }

  if (phase === 'done' && summary) {
    const pct = summary.firstTotal ? Math.round((summary.firstCorrect / summary.firstTotal) * 100) : null
    return (
      <Shell>
        <div className="solve-card vt-card">
          <PortalBack />
          <p className="vt-label">Сессия завершена</p>
          <h1>Отлично поработали!</h1>
          <div className="vt-tiles">
            <Tile value={summary.rules} label={rulesWord(summary.rules)} />
            <Tile value={summary.newRules} label={plural(summary.newRules, 'новое', 'новых', 'новых')} />
            <Tile value={pct === null ? '—' : `${pct}%`} label="с первой попытки" />
          </div>
          {summary.mistakes.length > 0 && (
            <p className="vt-mistakes">
              <span className="solve-muted">Стоит повторить:</span> {summary.mistakes.join('; ')}
            </p>
          )}
          <button className="sbtn sbtn-primary sbtn-big" onClick={reload}>
            Готово
          </button>
        </div>
      </Shell>
    )
  }

  const { due, fresh, stats } = session
  const count = due.length + fresh.length
  return (
    <Shell>
      <div className="solve-card vt-card">
        <PortalBack />
        <p className="solve-muted">{session.student ? `${session.student}, привет!` : 'Привет!'}</p>
        <h1>Грамматика{demo && ' · демо'}</h1>
        <div className="vt-tiles">
          <Tile value={due.length} label="повторить" />
          <Tile value={fresh.length} label={plural(fresh.length, 'новое правило', 'новых правила', 'новых правил')} />
          <Tile value={stats.streak} label={`${plural(stats.streak, 'день', 'дня', 'дней')} подряд`} />
          <Tile value={`${stats.known}/${stats.total}`} label="освоено" />
        </div>
        {count > 0 ? (
          <>
            <p className="solve-muted vt-hint">
              Главный вопрос Boundaries: что стоит слева и справа от пропуска — два полных предложения, неполная
              часть, пояснение, вставка или то, что нельзя разделять? Сначала ответь на него, потом выбирай знак.
              Клавиши 1–5 выбирают ответ, Enter — дальше.
            </p>
            <button
              className="sbtn sbtn-primary sbtn-big"
              onClick={() => {
                const u: Used = new Map()
                setQueue(buildQueue(session, u))
                setUsed(u)
                setPhase('session')
              }}
            >
              Начать · {count} {rulesWord(count)}
            </button>
          </>
        ) : stats.total === 0 ? (
          <p>Правил пока нет — преподаватель скоро их добавит.</p>
        ) : (
          <p>
            На сегодня всё{stats.reviews_today > 0 && ' — отличная работа'}. Возвращайся завтра: правило лучше
            закрепляется, когда встречаешь его снова через несколько дней.
          </p>
        )}
      </div>
    </Shell>
  )
}

function Tile({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="vt-tile">
      <span className="vt-tile-value">{value}</span>
      <span className="vt-tile-label">{label}</span>
    </div>
  )
}

// --- Сессия ------------------------------------------------------------------------

async function withRetry(fn: () => Promise<void>): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (e) {
      if (attempt >= 2) throw e
      await new Promise((r) => setTimeout(r, 1500))
    }
  }
}

function Trainer(props: { backend: GrammarBackend; initial: Entry[]; used: Used; onFinish: (s: Summary) => void }) {
  const { backend, initial, onFinish } = props
  const [queue, setQueue] = useState(initial)
  const [done, setDone] = useState(0)
  const [structPicked, setStructPicked] = useState<number | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
  const [showRule, setShowRule] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [finishing, setFinishing] = useState(false)

  const nextKey = useRef(initial.length)
  const shownAt = useRef(0)
  const chain = useRef<Promise<void>>(Promise.resolve())
  // упражнения, уже показанные в этой сессии (по правилу); трогаем только в обработчиках
  const used = useRef(props.used)
  const stats = useRef({ rules: new Set<string>(), firstTotal: 0, firstCorrect: 0, newRules: 0, mistakes: new Set<string>() })

  const entry = queue[0] as Entry | undefined
  const exercise = useMemo<Exercise | null>(() => {
    if (!entry || entry.intro) return null
    const item = entry.rule.items.find((i) => i.id === entry.itemId)
    return item ? buildExercise(entry.rule, item, entry.kind, entry.seed) : null
  }, [entry])

  useEffect(() => {
    shownAt.current = performance.now()
  }, [entry?.key])

  const send = useCallback((fn: () => Promise<void>) => {
    chain.current = chain.current.then(() => withRetry(fn)).then(
      () => setSaveError(false),
      () => setSaveError(true),
    )
  }, [])

  const finish = useCallback(() => {
    setFinishing(true)
    const s = stats.current
    void chain.current.then(() =>
      onFinish({ rules: s.rules.size, firstTotal: s.firstTotal, firstCorrect: s.firstCorrect, newRules: s.newRules, mistakes: [...s.mistakes] }),
    )
  }, [onFinish])

  /** Убирает текущий элемент; again — вставить через gap шагов. */
  const advance = useCallback(
    (again: Entry | null, gap: number) => {
      const rest = queue.slice(1)
      if (again) rest.splice(Math.min(rest.length, gap), 0, again)
      setPicked(null)
      setStructPicked(null)
      setShowRule(false)
      setDone((d) => d + 1)
      if (rest.length === 0) finish()
      else setQueue(rest)
      window.scrollTo({ top: 0 })
    },
    [queue, finish],
  )

  const onIntroDone = useCallback(() => {
    if (!entry) return
    const ms = performance.now() - shownAt.current
    send(() => backend.review({ ruleId: entry.rule.id, itemId: '', exercise: 'intro', correct: true, ms }))
    stats.current.newRules += 1
    // сразу разминка (не меняет ступень), через пару шагов — упражнение, которое переводит правило на ступень 2
    const base = { ...entry, intro: false, stage: 1, first: true }
    const warmup = withItem({ ...base, key: nextKey.current++, kind: 'warmup', seed: seed() }, used.current)
    const counted = withItem({ ...base, key: nextKey.current++, kind: 'cued', seed: seed() }, used.current)
    const rest = queue.slice(1)
    if (warmup) rest.splice(0, 0, warmup)
    if (counted) rest.splice(Math.min(rest.length, 3), 0, counted)
    if (rest.length === 0) {
      finish()
      return
    }
    setDone((d) => d + 1)
    setQueue(rest)
    window.scrollTo({ top: 0 })
  }, [entry, backend, send, queue, finish])

  const onStruct = useCallback(
    (i: number) => {
      if (!exercise?.structure || structPicked !== null) return
      setStructPicked(i)
    },
    [exercise, structPicked],
  )

  const onPick = useCallback(
    (i: number) => {
      if (!entry || !exercise || picked !== null) return
      if (exercise.structure && structPicked === null) return
      setPicked(i)
      const correct = i === exercise.answer
      const ms = performance.now() - shownAt.current
      const structureOk = exercise.structure ? structPicked === exercise.structure.answer : undefined
      send(() =>
        backend.review({
          ruleId: entry.rule.id,
          itemId: exercise.item.id,
          exercise: exercise.kind,
          correct,
          trap: correct ? undefined : exercise.options[i].trap,
          structureOk,
          ms,
        }),
      )
      if (exercise.kind === 'warmup') return
      const s = stats.current
      s.rules.add(entry.rule.id)
      if (entry.first) {
        s.firstTotal += 1
        if (correct) s.firstCorrect += 1
      }
      if (!correct) s.mistakes.add(entry.rule.title)
    },
    [entry, exercise, picked, structPicked, backend, send],
  )

  const onNext = useCallback(() => {
    if (!entry || !exercise || picked === null) return
    const correct = picked === exercise.answer
    if (correct || exercise.kind === 'warmup') {
      advance(null, 0)
      return
    }
    // ошибка — правило вернётся в этой же сессии с другим предложением, уже на ступень ниже
    const stage = nextStage(entry.stage, false)
    advance(withItem({ ...entry, key: nextKey.current++, stage, kind: exerciseKind(stage), seed: seed(), first: false }, used.current), 3)
  }, [entry, exercise, picked, advance])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || finishing || !entry) return
      const next = e.key === 'Enter' || e.key === ' '
      if (entry.intro) {
        if (next) {
          e.preventDefault()
          onIntroDone()
        }
        return
      }
      if (!exercise) return
      const n = Number(e.key)
      if (picked !== null) {
        if (next) {
          e.preventDefault()
          onNext()
        }
      } else if (exercise.structure && structPicked === null) {
        if (n >= 1 && n <= exercise.structure.options.length) onStruct(n - 1)
      } else if (n >= 1 && n <= exercise.options.length) {
        onPick(n - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [entry, exercise, picked, structPicked, finishing, onIntroDone, onStruct, onPick, onNext])

  if (finishing || !entry) {
    return <p className="solve-muted">Сохраняю…</p>
  }

  const total = done + queue.length
  return (
    <div className="vt">
      <header className="vt-bar">
        <div className="vt-progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
          <div style={{ width: `${(done / total) * 100}%` }} />
        </div>
        <span className="vt-count">
          {done} / {total}
        </span>
        <button className="sbtn" onClick={finish}>
          Закончить
        </button>
      </header>

      {saveError && (
        <p className="solve-error">Не удаётся сохранить ответы — проверьте интернет. Тренировку можно продолжать.</p>
      )}

      {entry.intro ? (
        <div className="solve-card vt-card" key={entry.key}>
          <p className="vt-label">Новое правило · {SKILL_TITLES[entry.rule.skill] ?? entry.rule.skill}</p>
          <RuleBody rule={entry.rule} />
          <button className="sbtn sbtn-primary sbtn-big" onClick={onIntroDone}>
            Понятно, к упражнениям
          </button>
        </div>
      ) : (
        exercise && (
          <ExerciseCard
            key={entry.key}
            rule={entry.rule}
            exercise={exercise}
            structPicked={structPicked}
            picked={picked}
            showRule={showRule}
            onStruct={onStruct}
            onPick={onPick}
            onToggleRule={() => setShowRule((v) => !v)}
            onNext={onNext}
          />
        )
      )}
    </div>
  )
}

/** Карточка правила: суть, объяснение, примеры верно/неверно, быстрая проверка. */
function RuleBody({ rule, compact }: { rule: GrammarRule; compact?: boolean }) {
  return (
    <div className="gr-rule">
      {compact ? <h3 className="gr-rule-title">{rule.title}</h3> : <h1 className="gr-rule-title">{rule.title}</h1>}
      {rule.summary && (
        <p className="gr-summary">
          <Rich text={rule.summary} />
        </p>
      )}
      {rule.body &&
        rule.body.split(/\n\s*\n/).map((p, i) => (
          <p key={i} className="gr-body">
            <Rich text={p} />
          </p>
        ))}
      {rule.examples.length > 0 && (
        <ul className="gr-examples">
          {rule.examples.map((ex, i) => (
            <li key={i} className={ex.ok ? 'gr-ex-ok' : 'gr-ex-bad'}>
              <span className="gr-ex-mark" aria-label={ex.ok ? 'верно' : 'неверно'}>
                {ex.ok ? '✓' : '✗'}
              </span>
              <span>
                <span className="gr-ex-text">
                  <Rich text={ex.text} />
                </span>
                {ex.note && (
                  <span className="gr-ex-note">
                    <Rich text={ex.note} />
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {rule.tip && (
        <p className="gr-tip">
          <Rich text={rule.tip} />
        </p>
      )}
    </div>
  )
}

/** Текст с пропуском: черта или выбранный вариант. */
function Cloze({ text, fill, ok }: { text: string; fill?: string; ok?: boolean }) {
  const parts = text.split(BLANK)
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 &&
            (fill !== undefined ? (
              <strong className={`gr-fill ${ok ? 'gr-fill-ok' : 'gr-fill-bad'}`}>{fill}</strong>
            ) : (
              <span className="vt-blank" aria-label="пропуск" />
            ))}
          {part}
        </span>
      ))}
    </>
  )
}

function ExerciseCard(props: {
  rule: GrammarRule
  exercise: Exercise
  structPicked: number | null
  picked: number | null
  showRule: boolean
  onStruct: (i: number) => void
  onPick: (i: number) => void
  onToggleRule: () => void
  onNext: () => void
}) {
  const { rule, exercise, structPicked, picked, showRule, onStruct, onPick, onToggleRule, onNext } = props
  const { structure } = exercise
  const structPending = Boolean(structure) && structPicked === null
  const answered = picked !== null
  const correct = picked === exercise.answer
  const label =
    exercise.kind === 'warmup' ? 'Разминка' : exercise.kind === 'cued' ? 'Упражнение' : 'Как на экзамене'

  return (
    <div className="solve-card vt-card">
      <p className="vt-label">
        {label}
        {exercise.kind !== 'sat' && <span className="gr-cue"> · {rule.title}</span>}
      </p>
      <p className="vt-text gr-text">
        <Cloze text={exercise.item.text} fill={answered ? exercise.options[picked].text : undefined} ok={correct} />
      </p>

      {structure && (
        <div className="gr-step">
          <p className="gr-step-q">Шаг 1. Что стоит слева и справа от пропуска?</p>
          <div className="vt-options">
            {structure.options.map((s, i) => {
              const state =
                structPicked === null ? '' : i === structure.answer ? 'vt-opt-ok' : i === structPicked ? 'vt-opt-bad' : 'vt-opt-dim'
              return (
                <button key={s.id} className={`vt-opt gr-opt-struct ${state}`} disabled={structPicked !== null} onClick={() => onStruct(i)}>
                  <span className="vt-opt-n">{i + 1}</span>
                  <span className="vt-opt-body">{s.label}</span>
                </button>
              )
            })}
          </div>
          {structPicked !== null && structPicked !== structure.answer && (
            <p className="solve-muted gr-step-note">Структура определена неверно — посмотри ещё раз на обе части и выбери знак.</p>
          )}
        </div>
      )}

      {!structPending && (
        <>
          <p className="gr-step-q">{structure ? `Шаг 2. ${SAT_STEM}` : SAT_STEM}</p>
          <div className="vt-options">
            {exercise.options.map((o, i) => {
              const state = !answered ? '' : i === exercise.answer ? 'vt-opt-ok' : i === picked ? 'vt-opt-bad' : 'vt-opt-dim'
              return (
                <button key={i} className={`vt-opt ${state}`} disabled={answered} onClick={() => onPick(i)}>
                  <span className="vt-opt-n">{i + 1}</span>
                  <span className="vt-opt-body">
                    <span className="gr-opt-text">{o.text}</span>
                    {answered && o.why && <span className="vt-opt-gloss">{o.why}</span>}
                  </span>
                </button>
              )
            })}
          </div>
        </>
      )}

      {answered && (
        <div className={`vt-feedback ${correct ? 'vt-feedback-ok' : 'vt-feedback-bad'}`}>
          <strong>{correct ? 'Верно' : 'Неверно'}</strong>
          <p className="gr-fb-rule">
            <b>{rule.title}.</b> <Rich text={rule.summary} />
          </p>
          {exercise.item.note && (
            <p className="vt-note">
              <Rich text={exercise.item.note} />
            </p>
          )}
          {!correct && exercise.kind !== 'warmup' && (
            <p className="solve-muted">Это правило ещё встретится сегодня — с другим предложением.</p>
          )}
          {showRule && <RuleBody rule={rule} compact />}
          <div className="gr-fb-actions">
            <button className="sbtn sbtn-primary" onClick={onNext} autoFocus>
              Дальше
            </button>
            <button className="sbtn" onClick={onToggleRule}>
              {showRule ? 'Скрыть правило' : 'Показать правило'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
