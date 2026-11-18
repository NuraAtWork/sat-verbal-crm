import type { SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { QuestionView } from '../components/QuestionView'
import { formatDate } from '../dates'
import {
  formatDuration,
  getAssignment,
  startAssignment,
  submitAssignment,
  type StudentAssignment,
  type SubmitResult,
} from '../sets'
import { supabase } from '../supabase'
import { TestSolve } from './TestSolve'

// Страница ученика: открывается по ссылке #/solve/<token>, без входа.

interface Progress {
  answers: (string | null)[]
  /** секунды на каждый вопрос */
  times: number[]
  current: number
}

const progressKey = (token: string) => `sat-solve:${token}`

function loadProgress(token: string, n: number): Progress | null {
  try {
    const raw = localStorage.getItem(progressKey(token))
    if (!raw) return null
    const p = JSON.parse(raw) as Progress
    if (!Array.isArray(p.answers) || p.answers.length !== n || !Array.isArray(p.times)) return null
    return p
  } catch {
    return null
  }
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function SolveApp({ token }: { token: string }) {
  if (!supabase) {
    return (
      <Shell>
        <div className="solve-card">
          <h1>Сервис ещё не настроен</h1>
          <p>Напишите преподавателю — ссылка заработает после настройки.</p>
        </div>
      </Shell>
    )
  }
  return <Solve sb={supabase} token={token} />
}

function Shell({ title, children }: { title?: string; children: ReactNode }) {
  useEffect(() => {
    document.title = title ? `${title} — SAT Verbal` : 'SAT Verbal'
  }, [title])
  return <div className="solve">{children}</div>
}

type Phase = 'loading' | 'missing' | 'error' | 'intro' | 'solving' | 'submitting' | 'results'

function Solve({ sb, token }: { sb: SupabaseClient; token: string }) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [data, setData] = useState<StudentAssignment | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [result, setResult] = useState<SubmitResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    getAssignment(sb, token).then(
      (a) => {
        if (cancelled) return
        if (!a) {
          setPhase('missing')
          return
        }
        setData(a)
        if (a.submitted_at && a.results) {
          setResult({
            submitted_at: a.submitted_at,
            duration_sec: a.duration_sec ?? 0,
            correct_count: a.correct_count ?? 0,
            total_count: a.total_count ?? a.questions.length,
            results: a.results,
          })
          setPhase('results')
          return
        }
        const saved = loadProgress(token, a.questions.length)
        if (saved) {
          setProgress(saved)
          setPhase('solving')
        } else {
          setPhase('intro')
        }
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
  }, [sb, token])

  const onStart = () => {
    if (!data) return
    const n = data.questions.length
    setProgress({ answers: Array(n).fill(null), times: Array(n).fill(0), current: 0 })
    setPhase('solving')
    void startAssignment(sb, token).catch(() => {})
  }

  const onSubmit = useCallback(
    async (p: Progress) => {
      setPhase('submitting')
      setError('')
      try {
        const r = await submitAssignment(sb, token, p.answers, p.times)
        localStorage.removeItem(progressKey(token))
        setResult(r)
        setPhase('results')
      } catch (e) {
        setError(errText(e))
        setProgress(p)
        setPhase('solving')
      }
    },
    [sb, token],
  )

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
          <h1>Задание не найдено</h1>
          <p>Проверьте ссылку или попросите преподавателя прислать её ещё раз.</p>
        </div>
      </Shell>
    )
  }
  if (phase === 'error' || !data) {
    return (
      <Shell>
        <div className="solve-card">
          <h1>Не удалось загрузить задание</h1>
          <p className="solve-error">{error}</p>
          <button className="sbtn sbtn-primary" onClick={() => window.location.reload()}>
            Попробовать ещё раз
          </button>
        </div>
      </Shell>
    )
  }

  // пробный тест — отдельный режим (модули с таймером, см. TestSolve)
  if (data.kind === 'test') {
    return (
      <Shell title={data.title}>
        <TestSolve sb={sb} token={token} data={data} />
      </Shell>
    )
  }

  if (phase === 'intro') {
    return (
      <Shell title={data.title}>
        <div className="solve-card">
          <p className="solve-muted">{data.student ? `${data.student}, привет!` : 'Привет!'}</p>
          <h1>{data.title}</h1>
          <ul className="solve-facts">
            <li>{data.questions.length} вопросов</li>
            {data.due_date && <li>Сдать до {formatDate(data.due_date)}</li>}
            <li>Таймер запустится после «Начать» и считает время на каждый вопрос.</li>
            <li>Между вопросами можно переходить. Прогресс сохраняется, если закрыть вкладку.</li>
            <li>После «Завершить» ответы изменить нельзя — сразу увидишь результат и разбор.</li>
          </ul>
          <button className="sbtn sbtn-primary sbtn-big" onClick={onStart}>
            Начать
          </button>
        </div>
      </Shell>
    )
  }

  if ((phase === 'solving' || phase === 'submitting') && progress) {
    return (
      <Shell title={data.title}>
        <Player
          key="player"
          token={token}
          data={data}
          initial={progress}
          submitting={phase === 'submitting'}
          error={error}
          onSubmit={onSubmit}
        />
      </Shell>
    )
  }

  if (phase === 'results' && result) {
    return (
      <Shell title={data.title}>
        <Results data={data} result={result} />
      </Shell>
    )
  }

  return null
}

// --- Решение -----------------------------------------------------------------------

function Player(props: {
  token: string
  data: StudentAssignment
  initial: Progress
  submitting: boolean
  error: string
  onSubmit: (p: Progress) => void
}) {
  const { token, data, initial, submitting, error, onSubmit } = props
  const n = data.questions.length
  const [answers, setAnswers] = useState<(string | null)[]>(initial.answers)
  const [current, setCurrent] = useState(initial.current)
  const [total, setTotal] = useState(() => initial.times.reduce((a, b) => a + b, 0))

  // Время копим в ref, чтобы не перерисовывать на каждый тик; считаем только пока вкладка видна.
  const times = useRef<number[]>([...initial.times])
  const currentRef = useRef(current)
  const last = useRef(0)
  const visible = useRef(true)
  const answersRef = useRef(answers)

  const save = useCallback(() => {
    const p: Progress = { answers: answersRef.current, times: times.current, current: currentRef.current }
    localStorage.setItem(progressKey(token), JSON.stringify(p))
  }, [token])

  const flush = useCallback(() => {
    const now = performance.now()
    if (visible.current) times.current[currentRef.current] += (now - last.current) / 1000
    last.current = now
    visible.current = document.visibilityState === 'visible'
  }, [])

  useEffect(() => {
    last.current = performance.now()
    visible.current = document.visibilityState === 'visible'
    const id = window.setInterval(() => {
      flush()
      setTotal(times.current.reduce((a, b) => a + b, 0))
      save()
    }, 1000)
    const onVisibility = () => {
      flush()
      save()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onVisibility)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onVisibility)
    }
  }, [flush, save])

  const goTo = (i: number) => {
    if (i < 0 || i >= n) return
    flush()
    currentRef.current = i
    setCurrent(i)
    save()
    window.scrollTo({ top: 0 })
  }

  const choose = (letter: string) => {
    const next = [...answersRef.current]
    next[current] = next[current] === letter ? null : letter
    answersRef.current = next
    setAnswers(next)
    save()
  }

  const finish = () => {
    flush()
    const unanswered = answersRef.current.filter((a) => !a).length
    const msg = unanswered
      ? `Без ответа: ${unanswered}. Всё равно завершить? Изменить ответы потом будет нельзя.`
      : 'Завершить и отправить ответы? Изменить их потом будет нельзя.'
    if (!confirm(msg)) return
    onSubmit({ answers: answersRef.current, times: times.current.map((t) => Math.round(t)), current: currentRef.current })
  }

  const answeredCount = answers.filter(Boolean).length
  const q = data.questions[current]

  return (
    <div className="player">
      <header className="player-bar">
        <div className="player-title">{data.title}</div>
        <div className="player-timer" title="Время решения">
          ⏱ {formatDuration(total)}
        </div>
        <button className="sbtn" onClick={finish} disabled={submitting}>
          {submitting ? 'Отправляю…' : 'Завершить'}
        </button>
      </header>

      {error && <p className="solve-error">Не удалось отправить: {error}. Попробуйте ещё раз.</p>}

      <div className="player-progress">
        Вопрос {current + 1} из {n} · отвечено {answeredCount}
      </div>

      <div className="paper player-paper">
        <QuestionView q={q} number={current + 1} selected={answers[current]} onSelect={submitting ? undefined : choose} />
      </div>

      <div className="player-nav">
        <button className="sbtn" onClick={() => goTo(current - 1)} disabled={current === 0}>
          ← Назад
        </button>
        {current < n - 1 ? (
          <button className="sbtn sbtn-primary" onClick={() => goTo(current + 1)}>
            Далее →
          </button>
        ) : (
          <button className="sbtn sbtn-primary" onClick={finish} disabled={submitting}>
            Завершить
          </button>
        )}
      </div>

      <div className="palette" aria-label="Все вопросы">
        {data.questions.map((_, i) => (
          <button
            key={i}
            className={`pcell ${answers[i] ? 'pcell-done' : ''} ${i === current ? 'pcell-current' : ''}`}
            onClick={() => goTo(i)}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  )
}

// --- Результат и разбор -----------------------------------------------------------

function Results({ data, result }: { data: StudentAssignment; result: SubmitResult }) {
  const firstWrong = result.results.findIndex((r) => !r.is_correct)
  const [current, setCurrent] = useState(firstWrong === -1 ? 0 : firstWrong)
  const pct = result.total_count ? Math.round((result.correct_count / result.total_count) * 100) : 0
  const r = result.results[current]
  const q = data.questions[current]

  return (
    <div className="player">
      <div className="solve-card results-card">
        <p className="solve-muted">{data.title}</p>
        <div className="results-score">
          {result.correct_count} <span>/ {result.total_count}</span>
        </div>
        <p>
          {pct}% верно · время {formatDuration(result.duration_sec)} · ответы отправлены преподавателю
        </p>
      </div>

      <h2 className="results-h">Разбор</h2>
      <div className="palette">
        {result.results.map((x, i) => (
          <button
            key={x.n}
            className={`pcell ${x.is_correct ? 'pcell-ok' : 'pcell-bad'} ${i === current ? 'pcell-current' : ''}`}
            onClick={() => setCurrent(i)}
            title={x.is_correct ? 'Верно' : `Твой ответ: ${x.answer ?? '—'}, верно: ${x.correct}`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {q && r && (
        <>
          <div className="player-progress">
            Вопрос {current + 1}: {r.is_correct ? 'верно ✓' : r.answer ? `твой ответ ${r.answer}, верно ${r.correct}` : `нет ответа, верно ${r.correct}`}{' '}
            · {formatDuration(r.time_sec)}
          </div>
          <div className="paper player-paper">
            <QuestionView q={q} number={current + 1} selected={r.answer} correct={r.correct} />
          </div>
          <div className="player-nav">
            <button className="sbtn" onClick={() => setCurrent((c) => Math.max(0, c - 1))} disabled={current === 0}>
              ← Назад
            </button>
            <button
              className="sbtn"
              onClick={() => setCurrent((c) => Math.min(result.results.length - 1, c + 1))}
              disabled={current === result.results.length - 1}
            >
              Далее →
            </button>
          </div>
        </>
      )}
    </div>
  )
}
