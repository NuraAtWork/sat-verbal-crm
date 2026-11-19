import { useEffect, useState } from 'react'
import { formatDate } from '../dates'
import { supabase } from '../supabase'
import type { Student } from '../types'
import { useStore } from '../useStore'
import {
  createEnrollment,
  fetchVocabStats,
  getEnrollment,
  plural,
  setNewPerDay,
  vocabUrl,
  type VocabEnrollment,
  type VocabStats,
} from '../vocab'
import '../vocab/vocab.css'

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const DAYS = 14

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Последние DAYS дней (YYYY-MM-DD), сегодня — последний. */
function lastDays(): string[] {
  return Array.from({ length: DAYS }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (DAYS - 1 - i))
    return isoDay(d)
  })
}

/** Блок «Словарь» в карточке ученика (только облачный режим). */
export function StudentVocab({ student }: { student: Student }) {
  const { sync } = useStore()
  // undefined — ещё грузится, null — тренер не включён
  const [enrollment, setEnrollment] = useState<VocabEnrollment | null | undefined>(undefined)
  const [stats, setStats] = useState<VocabStats | null>(null)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    Promise.all([getEnrollment(supabase, student.id), fetchVocabStats(supabase, student.id)]).then(
      ([e, s]) => {
        if (cancelled) return
        setEnrollment(e)
        setStats(s)
        setError('')
      },
      (e: unknown) => !cancelled && setError(errText(e)),
    )
    return () => {
      cancelled = true
    }
  }, [student.id, reloadKey])

  if (sync.mode !== 'cloud' || !supabase) {
    return (
      <p className="muted">
        Тренер слов работает в облачном режиме — после подключения Supabase. Посмотреть, как он выглядит для
        ученика:{' '}
        <a href="#/vocab/demo" target="_blank" rel="noreferrer">
          демо
        </a>
        .
      </p>
    )
  }
  const sb = supabase

  if (error && enrollment === undefined) {
    return (
      <p className="error-text">
        Не удалось загрузить словарь: {error}. Если тренер ещё не подключён, выполните блок «Тренер словаря» из
        supabase/schema.sql в SQL Editor.
      </p>
    )
  }
  if (enrollment === undefined || !stats) return <p className="muted">Загрузка…</p>

  const onEnable = async () => {
    setBusy(true)
    setError('')
    try {
      setEnrollment(await createEnrollment(sb, student.id))
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  if (!enrollment) {
    return (
      <div>
        <p className="muted">
          Ученик получает постоянную ссылку и каждый день повторяет слова: карточка нового слова, затем упражнения
          с пропуском в контексте, как в Words in Context. В словаре сейчас {stats.words_total}{' '}
          {plural(stats.words_total, 'слово', 'слова', 'слов')}
          {stats.words_total === 0 && ' — загрузите слова в «Данные → Добавить из файла»'}.
        </p>
        <button className="btn btn-primary" disabled={busy} onClick={onEnable}>
          {busy ? 'Включаю…' : 'Включить тренер слов'}
        </button>
        {error && <p className="error-text">{error}</p>}
      </div>
    )
  }

  const onNewPerDay = async (value: string) => {
    const n = Math.min(50, Math.max(0, Math.round(Number(value) || 0)))
    if (n === enrollment.newPerDay) return
    setEnrollment({ ...enrollment, newPerDay: n })
    try {
      await setNewPerDay(sb, enrollment.id, n)
      setError('')
    } catch (e) {
      setError(errText(e))
    }
  }

  const byDay = new Map(stats.days.map((d) => [d.day, d]))
  const days = lastDays().map((day) => byDay.get(day) ?? { day, reviews: 0, correct: 0, intro: 0, ms: 0 })
  const max = Math.max(1, ...days.map((d) => d.reviews))
  const reviews = days.reduce((a, d) => a + d.reviews, 0)
  const correct = days.reduce((a, d) => a + d.correct, 0)
  const ms = days.reduce((a, d) => a + d.ms, 0)
  const timeNote = ms < 60000 ? 'меньше минуты' : `около ${Math.round(ms / 60000)} мин`
  const activeDays = days.filter((d) => d.reviews > 0).length

  return (
    <div>
      <div className="inline-form">
        <button
          className="btn btn-small"
          onClick={async () => {
            await navigator.clipboard.writeText(vocabUrl(enrollment.token))
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? 'Скопировано ✓' : 'Скопировать ссылку ученика'}
        </button>
        <label className="row small muted">
          новых слов в день
          <input
            className="input score-input"
            type="number"
            min={0}
            max={50}
            defaultValue={enrollment.newPerDay}
            onBlur={(e) => void onNewPerDay(e.target.value)}
          />
        </label>
        <button className="link-btn push-right" onClick={() => setReloadKey((k) => k + 1)}>
          Обновить
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}
      {stats.words_total === 0 && (
        <p className="muted small">Словарь пуст — загрузите слова в «Данные → Добавить из файла».</p>
      )}

      <div className="stats vocab-stats">
        <div className="stat">
          <span className="stat-value">{stats.known}</span>
          <span className="stat-label">Выучено</span>
        </div>
        <div className="stat">
          <span className="stat-value">{stats.started - stats.known}</span>
          <span className="stat-label">В работе</span>
        </div>
        <div className="stat">
          <span className="stat-value">{stats.due}</span>
          <span className="stat-label">Ждут повторения</span>
        </div>
        <div className="stat">
          <span className="stat-value">{stats.words_total}</span>
          <span className="stat-label">Слов в словаре</span>
        </div>
      </div>

      <div className="vocab-days" aria-label={`Ответы по дням за ${DAYS} дней`}>
        {days.map((d) => (
          <div
            key={d.day}
            className={`vocab-day ${d.reviews ? '' : 'vocab-day-empty'}`}
            title={
              d.reviews
                ? `${formatDate(d.day)}: ответов ${d.reviews}, верно ${Math.round((d.correct / d.reviews) * 100)}%, новых слов ${d.intro}`
                : `${formatDate(d.day)}: не занимался`
            }
          >
            <div className="vocab-day-bar" style={{ height: `${(d.reviews / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="vocab-days-axis">
        <span>{formatDate(days[0].day)}</span>
        <span>сегодня</span>
      </div>

      <p className="small muted">
        {reviews > 0
          ? `За ${DAYS} дней: занимался ${activeDays} ${plural(activeDays, 'день', 'дня', 'дней')}, ответов ${reviews}, верно ${Math.round((correct / reviews) * 100)}%, ${timeNote}.`
          : stats.last_reviewed_at
            ? `За ${DAYS} дней не занимался. Последняя тренировка: ${new Date(stats.last_reviewed_at).toLocaleDateString('ru-RU', { dateStyle: 'medium' })}.`
            : 'Ученик ещё не открывал тренер.'}
      </p>

      {stats.hard.length > 0 && (
        <div>
          <div className="small muted">Трудные слова (сколько раз ошибся)</div>
          <div className="chips">
            {stats.hard.map((h) => (
              <span key={h.word} className="chip small">
                {h.word} <b>×{h.lapses}</b>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
