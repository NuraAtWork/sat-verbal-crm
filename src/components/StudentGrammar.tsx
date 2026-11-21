import { useEffect, useState } from 'react'
import { formatDate } from '../dates'
import {
  MAX_STAGE,
  SKILL_TITLES,
  createGrammarEnrollment,
  fetchGrammarStats,
  getGrammarEnrollment,
  grammarUrl,
  setGrammarNewPerDay,
  trapLabel,
  type GrammarEnrollment,
  type GrammarStats,
} from '../grammar'
import { supabase } from '../supabase'
import type { Student } from '../types'
import { useStore } from '../useStore'
import { plural } from '../vocab'
import '../vocab/vocab.css'
import '../grammar/grammar.css'

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const DAYS = 14

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function lastDays(): string[] {
  return Array.from({ length: DAYS }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (DAYS - 1 - i))
    return isoDay(d)
  })
}

/** «сегодня», «завтра», «через 5 дн.» — когда правило снова покажется ученику. */
function dueLabel(dueAt: string | null): string {
  if (!dueAt) return ''
  const days = Math.ceil((new Date(dueAt).getTime() - Date.now()) / 86_400_000)
  if (days <= 0) return 'сегодня'
  if (days === 1) return 'завтра'
  return `через ${days} дн.`
}

/** Блок «Грамматика» в карточке ученика (только облачный режим). */
export function StudentGrammar({ student }: { student: Student }) {
  const { sync } = useStore()
  // undefined — ещё грузится, null — тренер не включён
  const [enrollment, setEnrollment] = useState<GrammarEnrollment | null | undefined>(undefined)
  const [stats, setStats] = useState<GrammarStats | null>(null)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    Promise.all([getGrammarEnrollment(supabase, student.id), fetchGrammarStats(supabase, student.id)]).then(
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
        Тренер грамматики работает в облачном режиме. Как он выглядит для ученика:{' '}
        <a href="#/grammar/demo" target="_blank" rel="noreferrer">
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
        Не удалось загрузить тренер грамматики: {error}. Если он ещё не подключён, выполните блок «Тренер грамматики»
        из supabase/schema.sql в SQL Editor.
      </p>
    )
  }
  if (enrollment === undefined || !stats) return <p className="muted">Загрузка…</p>

  const onEnable = async () => {
    setBusy(true)
    setError('')
    try {
      setEnrollment(await createGrammarEnrollment(sb, student.id))
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
          Ученик получает постоянную ссылку и каждый день проходит правила: карточка нового правила, затем
          упражнения в формате SAT; с 3-й ступени — сначала «что слева и справа от пропуска?», потом выбор знака.
          Правил в тренере: {stats.rules_total}
          {stats.rules_total === 0 && ' — загрузите их в «Данные → Добавить из файла» (grammarRules)'}.{' '}
          <a href="#/grammar/demo" target="_blank" rel="noreferrer">
            Демо
          </a>
        </p>
        <button className="btn btn-primary" disabled={busy} onClick={onEnable}>
          {busy ? 'Включаю…' : 'Включить тренер грамматики'}
        </button>
        {error && <p className="error-text">{error}</p>}
      </div>
    )
  }

  const onNewPerDay = async (value: string) => {
    const n = Math.min(10, Math.max(0, Math.round(Number(value) || 0)))
    if (n === enrollment.newPerDay) return
    setEnrollment({ ...enrollment, newPerDay: n })
    try {
      await setGrammarNewPerDay(sb, enrollment.id, n)
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
  const activeDays = days.filter((d) => d.reviews > 0).length
  const structurePct = stats.structure.total ? Math.round((stats.structure.correct / stats.structure.total) * 100) : null
  const started = stats.rules.filter((r) => r.stage !== null)
  const notStarted = stats.rules.length - started.length

  return (
    <div>
      <div className="inline-form">
        <button
          className="btn btn-small"
          onClick={async () => {
            await navigator.clipboard.writeText(grammarUrl(enrollment.token))
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? 'Скопировано ✓' : 'Скопировать ссылку ученика'}
        </button>
        <label className="row small muted">
          новых правил в день
          <input
            className="input score-input"
            type="number"
            min={0}
            max={10}
            defaultValue={enrollment.newPerDay}
            onBlur={(e) => void onNewPerDay(e.target.value)}
          />
        </label>
        <button className="link-btn push-right" onClick={() => setReloadKey((k) => k + 1)}>
          Обновить
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
      {stats.rules_total === 0 && (
        <p className="muted small">Правил пока нет — загрузите их в «Данные → Добавить из файла» (grammarRules).</p>
      )}

      <div className="stats vocab-stats">
        <div className="stat">
          <span className="stat-value">{stats.known}</span>
          <span className="stat-label">Освоено</span>
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
          <span className="stat-value">{structurePct === null ? '—' : `${structurePct}%`}</span>
          <span className="stat-label">Структура верно</span>
        </div>
      </div>

      {started.length > 0 && (
        <div className="gm-rules">
          {started.map((r) => (
            <div key={r.id} style={{ display: 'contents' }}>
              <span title={SKILL_TITLES[r.skill] ?? r.skill}>{r.title}</span>
              <span className="gm-dots" title={`Ступень ${r.stage} из ${MAX_STAGE}`}>
                {Array.from({ length: MAX_STAGE }, (_, i) => (
                  <i key={i} className={i < (r.stage ?? 0) ? 'on' : ''} />
                ))}
              </span>
              <span className="small muted">
                {dueLabel(r.due_at)}
                {r.lapses ? ` · ошибок ${r.lapses}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
      {notStarted > 0 && (
        <p className="small muted">
          Ещё не начато: {notStarted} {plural(notStarted, 'правило', 'правила', 'правил')} — войдут по {enrollment.newPerDay} в день.
        </p>
      )}

      {stats.traps.length > 0 && (
        <div>
          <div className="small muted">На чём ошибается (30 дней)</div>
          <ul className="gm-traps">
            {stats.traps.slice(0, 6).map((t) => (
              <li key={t.trap}>
                <span>{trapLabel(t.trap)}</span>
                <b>{t.n}</b>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="vocab-days" aria-label={`Ответы по дням за ${DAYS} дней`}>
        {days.map((d) => (
          <div
            key={d.day}
            className={`vocab-day ${d.reviews ? '' : 'vocab-day-empty'}`}
            title={
              d.reviews
                ? `${formatDate(d.day)}: ответов ${d.reviews}, верно ${Math.round((d.correct / d.reviews) * 100)}%, новых правил ${d.intro}`
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
          ? `За ${DAYS} дней: занимался ${activeDays} ${plural(activeDays, 'день', 'дня', 'дней')}, ответов ${reviews}, верно ${Math.round((correct / reviews) * 100)}%.`
          : stats.last_reviewed_at
            ? `За ${DAYS} дней не занимался. Последняя тренировка: ${new Date(stats.last_reviewed_at).toLocaleDateString('ru-RU', { dateStyle: 'medium' })}.`
            : 'Ученик ещё не открывал тренер.'}
      </p>
    </div>
  )
}
