import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../supabase'
import {
  BLANK,
  buildExercise,
  checkTyped,
  cloudBackend,
  nextStage,
  plural,
  usableContexts,
  type Exercise,
  type GlossaryEntry,
  type PoolWord,
  type TypedVerdict,
  type VocabBackend,
  type VocabSession,
  type VocabWord,
} from '../vocab'
import { demoBackend } from './demo'
import './vocab.css'

// Тренер словаря для ученика: постоянная ссылка #/vocab/<token>, без входа.
// #/vocab/demo — демо с примерами слов, прогресс хранится в браузере.

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const wordsWord = (n: number) => plural(n, 'слово', 'слова', 'слов')

export function VocabApp({ token }: { token: string }) {
  const backend = useMemo<VocabBackend | null>(
    () => (token === 'demo' ? demoBackend : supabase ? cloudBackend(supabase, token) : null),
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
  return <Vocab backend={backend} demo={token === 'demo'} />
}

function Shell({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.title = 'Словарь — SAT Verbal'
  }, [])
  return <div className="solve">{children}</div>
}

/** Элемент очереди сессии: карточка нового слова или упражнение. */
interface Item {
  key: number
  word: VocabWord
  intro: boolean
  stage: number
  reps: number
  seed: number
  /** Первая попытка по этому слову за сессию (для подсчёта точности) */
  first: boolean
}

interface Summary {
  words: number
  firstTotal: number
  firstCorrect: number
  newWords: number
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

/** Повторения вперемешку, карточки новых слов — равномерно между ними. */
function buildQueue(s: VocabSession): Item[] {
  let key = 0
  const reviews: Item[] = shuffle(s.due).map((w) => ({
    key: key++, word: w, intro: false, stage: w.stage, reps: w.reps, seed: seed(), first: true,
  }))
  const intros: Item[] = s.fresh.map((w) => ({
    key: key++, word: w, intro: true, stage: 0, reps: 0, seed: seed(), first: true,
  }))
  const step = Math.max(2, Math.ceil(reviews.length / (intros.length + 1)))
  const out: Item[] = []
  reviews.forEach((r, i) => {
    out.push(r)
    const next = (i + 1) % step === 0 ? intros.shift() : undefined
    if (next) out.push(next)
  })
  return [...out, ...intros]
}

type Phase = 'loading' | 'missing' | 'error' | 'home' | 'session' | 'done'

function Vocab({ backend, demo }: { backend: VocabBackend; demo: boolean }) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [session, setSession] = useState<VocabSession | null>(null)
  const [queue, setQueue] = useState<Item[]>([])
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

  // запас слов для неверных вариантов: случайные слова словаря + слова этой сессии
  const pool = useMemo<PoolWord[]>(() => {
    if (!session) return []
    const seen = new Set<string>()
    return [...session.pool, ...session.due, ...session.fresh].filter((w) => {
      if (seen.has(w.word)) return false
      seen.add(w.word)
      return true
    })
  }, [session])

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
          <h1>Не удалось загрузить словарь</h1>
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
          pool={pool}
          glossary={session.glossary ?? {}}
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
          <p className="vt-label">Сессия завершена</p>
          <h1>Отлично поработали!</h1>
          <div className="vt-tiles">
            <Tile value={summary.words} label={wordsWord(summary.words)} />
            <Tile value={summary.newWords} label={plural(summary.newWords, 'новое', 'новых', 'новых')} />
            <Tile value={pct === null ? '—' : `${pct}%`} label="с первой попытки" />
          </div>
          {summary.mistakes.length > 0 && (
            <p className="vt-mistakes">
              <span className="solve-muted">Стоит повторить:</span> {summary.mistakes.join(', ')}
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
        <p className="solve-muted">{session.student ? `${session.student}, привет!` : 'Привет!'}</p>
        <h1>Словарь{demo && ' · демо'}</h1>
        <div className="vt-tiles">
          <Tile value={due.length} label="повторить" />
          <Tile value={fresh.length} label={plural(fresh.length, 'новое', 'новых', 'новых')} />
          <Tile value={stats.streak} label={`${plural(stats.streak, 'день', 'дня', 'дней')} подряд`} />
          <Tile value={`${stats.known}/${stats.total}`} label="выучено" />
        </div>
        {count > 0 ? (
          <>
            <p className="solve-muted vt-hint">
              Сначала прочитай предложение целиком и прикинь, какое слово нужно по смыслу, — и только потом смотри
              варианты. Клавиши 1–4 выбирают ответ, Enter — дальше.
            </p>
            <button
              className="sbtn sbtn-primary sbtn-big"
              onClick={() => {
                setQueue(buildQueue(session))
                setPhase('session')
              }}
            >
              Начать · {count} {wordsWord(count)}
            </button>
          </>
        ) : stats.total === 0 ? (
          <p>Слов пока нет — преподаватель скоро их добавит.</p>
        ) : (
          <p>
            На сегодня всё{stats.reviews_today > 0 && ' — отличная работа'}. Возвращайся завтра: слова лучше
            запоминаются, когда повторяешь их понемногу каждый день.
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

function Trainer(props: {
  backend: VocabBackend
  initial: Item[]
  pool: PoolWord[]
  glossary: Record<string, GlossaryEntry>
  onFinish: (s: Summary) => void
}) {
  const { backend, initial, pool, glossary, onFinish } = props
  const [queue, setQueue] = useState(initial)
  const [done, setDone] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  // «сначала подумай сам»: варианты открыты и что ученик предположил
  const [revealed, setRevealed] = useState(false)
  const [guess, setGuess] = useState('')
  // упражнение «впиши слово»: что ввёл ученик и как это оценено
  const [typed, setTyped] = useState<{ text: string; verdict: TypedVerdict } | null>(null)
  const [saveError, setSaveError] = useState(false)
  const [finishing, setFinishing] = useState(false)

  const nextKey = useRef(initial.length)
  const shownAt = useRef(0)
  // ответы отправляются по очереди, чтобы сервер видел их в том же порядке
  const chain = useRef<Promise<void>>(Promise.resolve())
  const stats = useRef({ words: new Set<string>(), firstTotal: 0, firstCorrect: 0, newWords: 0, mistakes: new Set<string>() })

  const item = queue[0] as Item | undefined
  const exercise = useMemo<Exercise | null>(
    () => (item && !item.intro ? buildExercise(item.word, item.stage, item.reps, pool, item.seed) : null),
    [item, pool],
  )

  useEffect(() => {
    shownAt.current = performance.now()
  }, [item?.key])

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
      onFinish({
        words: s.words.size,
        firstTotal: s.firstTotal,
        firstCorrect: s.firstCorrect,
        newWords: s.newWords,
        mistakes: [...s.mistakes],
      }),
    )
  }, [onFinish])

  /** Убирает текущий элемент и, если нужно, ставит следующий показ слова через несколько шагов. */
  const advance = useCallback(
    (again: Item | null, gap: number) => {
      const rest = queue.slice(1)
      if (again) rest.splice(Math.min(rest.length, gap), 0, again)
      setPicked(null)
      setRevealed(false)
      setGuess('')
      setTyped(null)
      setDone((d) => d + 1)
      if (rest.length === 0) finish()
      else setQueue(rest)
      window.scrollTo({ top: 0 })
    },
    [queue, finish],
  )

  const onIntroDone = useCallback(() => {
    if (!item) return
    const ms = performance.now() - shownAt.current
    send(() => backend.review(item.word.id, 'intro', true, ms))
    stats.current.newWords += 1
    advance({ ...item, key: nextKey.current++, intro: false, stage: 1, seed: seed() }, 2)
  }, [item, backend, send, advance])

  /** Отправляет ответ на сервер и учитывает его в итогах сессии. */
  const record = useCallback(
    (it: Item, ex: Exercise, correct: boolean) => {
      const ms = performance.now() - shownAt.current
      send(() => backend.review(it.word.id, ex.kind, correct, ms))
      const s = stats.current
      s.words.add(it.word.word)
      if (it.first) {
        s.firstTotal += 1
        if (correct) s.firstCorrect += 1
      }
      if (!correct) s.mistakes.add(it.word.word)
    },
    [backend, send],
  )

  const onPick = useCallback(
    (i: number) => {
      if (!item || !exercise || picked !== null || (exercise.predict && !revealed)) return
      setPicked(i)
      record(item, exercise, i === exercise.answer)
    },
    [item, exercise, picked, revealed, record],
  )

  const onSubmitTyped = useCallback(() => {
    if (!item || !exercise || exercise.kind !== 'type' || typed !== null || !guess.trim()) return
    const verdict = checkTyped(guess, exercise.expected ?? item.word.word, item.word.word)
    setTyped({ text: guess.trim(), verdict })
    record(item, exercise, verdict !== 'wrong')
  }, [item, exercise, typed, guess, record])

  const onNext = useCallback(() => {
    if (!item || !exercise || (picked === null && typed === null)) return
    const correct = typed ? typed.verdict !== 'wrong' : picked === exercise.answer
    // ошибка — слово вернётся в этой же сессии, уже на ступень ниже
    const again: Item | null = correct
      ? null
      : { ...item, key: nextKey.current++, stage: nextStage(item.stage, false), reps: item.reps + 1, seed: seed(), first: false }
    advance(again, 3)
  }, [item, exercise, picked, typed, advance])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || finishing || !item) return
      const next = e.key === 'Enter' || e.key === ' '
      if (item.intro) {
        if (next) {
          e.preventDefault()
          onIntroDone()
        }
      } else if (picked === null && typed === null) {
        if (exercise?.kind === 'type') {
          if (e.key === 'Enter') {
            e.preventDefault()
            onSubmitTyped()
          }
          return
        }
        if (exercise?.predict && !revealed) {
          if (e.key === 'Enter') {
            e.preventDefault()
            setRevealed(true)
          }
          return
        }
        const n = Number(e.key)
        if (exercise && n >= 1 && n <= exercise.options.length) onPick(n - 1)
      } else if (next) {
        e.preventDefault()
        onNext()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [item, exercise, picked, typed, revealed, finishing, onIntroDone, onPick, onSubmitTyped, onNext])

  if (finishing || !item) {
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

      {item.intro ? (
        <IntroCard key={item.key} word={item.word} onDone={onIntroDone} />
      ) : (
        exercise && (
          <ExerciseCard
            key={item.key}
            word={item.word}
            exercise={exercise}
            picked={picked}
            revealed={revealed}
            guess={guess}
            typed={typed}
            glossary={glossary}
            onSubmitTyped={onSubmitTyped}
            onGuess={setGuess}
            onReveal={() => setRevealed(true)}
            onPick={onPick}
            onNext={onNext}
          />
        )
      )}
    </div>
  )
}

/** Текст с пропуском: пустая черта или вписанное слово. */
function Cloze({ text, fill }: { text: string; fill?: string }) {
  const parts = text.split(BLANK)
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && (fill ? <strong className="vt-fill">{fill}</strong> : <span className="vt-blank" aria-label="пропуск" />)}
          {part}
        </span>
      ))}
    </>
  )
}

const CONNOTATION: Record<string, string> = {
  positive: 'положительный оттенок',
  negative: 'отрицательный оттенок',
  neutral: 'нейтральное',
}

function WordHead({ word }: { word: VocabWord }) {
  return (
    <div className="vt-head">
      <span className="vt-word">{word.word}</span>
      {word.pos && <span className="vt-pos">{word.pos}</span>}
      {word.connotation && <span className={`vt-tone vt-tone-${word.connotation}`}>{CONNOTATION[word.connotation]}</span>}
    </div>
  )
}

function IntroCard({ word, onDone }: { word: VocabWord; onDone: () => void }) {
  const examples = usableContexts(word).slice(0, 2)
  return (
    <div className="solve-card vt-card">
      <p className="vt-label">Новое слово</p>
      <WordHead word={word} />
      <p className="vt-def">{word.definition}</p>
      {word.translation && <p className="vt-tr">{word.translation}</p>}
      {examples.length > 0 && (
        <ul className="vt-examples">
          {examples.map((c, i) => (
            <li key={i}>
              <Cloze text={c.text} fill={c.answer?.trim() || word.word} />
            </li>
          ))}
        </ul>
      )}
      {word.confusables.length > 0 && (
        <p className="vt-confuse">
          <span className="solve-muted">Не путать с:</span> {word.confusables.join(', ')}
        </p>
      )}
      <button className="sbtn sbtn-primary sbtn-big" onClick={onDone}>
        Понятно, дальше
      </button>
    </div>
  )
}

const QUESTION: Record<Exercise['kind'], string> = {
  meaning: 'Что значит это слово?',
  cloze: 'Какое слово подходит по смыслу и точнее всего?',
  reverse: 'Какое слово соответствует определению?',
  type: 'Впиши слово',
}

function ExerciseCard(props: {
  word: VocabWord
  exercise: Exercise
  picked: number | null
  revealed: boolean
  guess: string
  typed: { text: string; verdict: TypedVerdict } | null
  glossary: Record<string, GlossaryEntry>
  onSubmitTyped: () => void
  onGuess: (value: string) => void
  onReveal: () => void
  onPick: (i: number) => void
  onNext: () => void
}) {
  const { word, exercise, picked, revealed, guess, typed, glossary, onSubmitTyped, onGuess, onReveal, onPick, onNext } = props
  const predicting = Boolean(exercise.predict) && !revealed
  const answered = picked !== null || typed !== null
  const correct = typed ? typed.verdict !== 'wrong' : picked === exercise.answer
  const shownAnswer = exercise.kind === 'type' ? exercise.expected : exercise.options[exercise.answer]

  return (
    <div className="solve-card vt-card">
      <p className="vt-label">{QUESTION[exercise.kind]}</p>
      {exercise.kind === 'meaning' && (
        <div className="vt-head">
          <span className="vt-word">{exercise.prompt}</span>
          {word.pos && <span className="vt-pos">{word.pos}</span>}
        </div>
      )}
      {exercise.kind === 'reverse' && <p className="vt-def">{exercise.prompt}</p>}
      {(exercise.kind === 'cloze' || (exercise.kind === 'type' && exercise.context)) && (
        <p className="vt-text">
          <Cloze text={exercise.prompt} fill={answered ? shownAnswer : undefined} />
        </p>
      )}
      {exercise.kind === 'type' && !exercise.context && (
        <>
          <p className="vt-def">{exercise.prompt}</p>
          {word.translation && <p className="vt-tr">{word.translation}</p>}
        </>
      )}

      {exercise.kind === 'type' ? (
        typed ? (
          <p className="solve-muted">
            Твой ответ: <strong>{typed.text}</strong>
            {typed.verdict === 'close' && (
              <>
                {' '}
                — почти, пишется <strong>{exercise.expected}</strong>
              </>
            )}
          </p>
        ) : (
          <div className="vt-predict">
            <p className="vt-predict-hint">Вариантов нет — впиши слово сам. Подсказка: {exercise.hint}</p>
            <input
              className="vt-input"
              value={guess}
              onChange={(e) => onGuess(e.target.value)}
              placeholder="Слово"
              autoFocus
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            <button className="sbtn sbtn-primary" onClick={onSubmitTyped} disabled={!guess.trim()}>
              Проверить
            </button>
          </div>
        )
      ) : predicting ? (
        <div className="vt-predict">
          <p className="vt-predict-hint">
            Сначала сам: какое слово сюда просится? Хватит и направления — похвала или критика, больше или меньше.
          </p>
          <input
            className="vt-input"
            value={guess}
            onChange={(e) => onGuess(e.target.value)}
            placeholder="Твоя догадка (необязательно)"
            autoFocus
          />
          <button className="sbtn sbtn-primary" onClick={onReveal}>
            Показать варианты
          </button>
        </div>
      ) : (
        <>
          {exercise.predict && guess.trim() && (
            <p className="solve-muted">
              Твоя догадка: <strong>{guess.trim()}</strong>
            </p>
          )}
          <div className="vt-options">
            {exercise.options.map((option, i) => {
              const state = !answered ? '' : i === exercise.answer ? 'vt-opt-ok' : i === picked ? 'vt-opt-bad' : 'vt-opt-dim'
              // после ответа — что значат неверные варианты
              const gloss = answered && exercise.kind === 'cloze' && i !== exercise.answer ? glossary[option.toLowerCase()] : undefined
              return (
                <button key={i} className={`vt-opt ${state}`} disabled={answered} onClick={() => onPick(i)}>
                  <span className="vt-opt-n">{i + 1}</span>
                  <span className="vt-opt-body">
                    <span>{option}</span>
                    {gloss && <span className="vt-opt-gloss">{gloss.definition}</span>}
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
          <WordHead word={word} />
          <p className="vt-def">{word.definition}</p>
          {word.translation && <p className="vt-tr">{word.translation}</p>}
          {exercise.note && <p className="vt-note">{exercise.note}</p>}
          {!correct && <p className="solve-muted">Это слово ещё встретится сегодня.</p>}
          <button className="sbtn sbtn-primary" onClick={onNext} autoFocus>
            Дальше
          </button>
        </div>
      )}
    </div>
  )
}
