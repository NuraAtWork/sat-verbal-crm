import { ArrowRight, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  MIN_SAMPLE,
  WEAK_BELOW,
  accuracy,
  avgTime,
  emptyTally,
  recommendSets,
  skipRate,
  type Analytics,
  type SkillStats,
  type Tally,
  type Trend,
} from '../analytics'
import { DOMAINS, skillName } from '../sat'
import { createAssignment, formatDuration } from '../sets'
import { supabase } from '../supabase'
import type { Lesson } from '../types'
import type { SkillData } from '../useSkillAnalytics'
import { useStore } from '../useStore'
import { CopyLink } from './Assignments'
import '../analytics.css'

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`)

// --- Карточка «Навыки» ------------------------------------------------------------

/**
 * Единая таблица навыков: «на уроках» (из журнала) и «как решает» (из сданных заданий) в одной строке,
 * сгруппировано по доменам. Заменяет в облачном режиме блок «Пройденные темы».
 */
export function SkillAnalyticsCard({
  data,
  lessons,
  onReload,
}: {
  data: SkillData
  lessons: Lesson[]
  onReload: () => void
}) {
  const lessonCounts = new Map<string, number>()
  for (const l of lessons) for (const t of l.topics) lessonCounts.set(t, (lessonCounts.get(t) ?? 0) + 1)
  const a = data.analytics
  const hasData = !!a && a.submitted > 0

  return (
    <section className="card skills-card">
      <div className="row spread">
        <h2>Навыки</h2>
        <button className="link-btn" onClick={onReload} disabled={data.loading}>
          {data.loading ? 'Загрузка…' : 'Обновить'}
        </button>
      </div>

      {data.error && <p className="error-text">Не удалось загрузить результаты: {data.error}</p>}

      {hasData ? (
        <Summary a={a} />
      ) : (
        !data.loading &&
        !data.error && (
          <p className="sk-empty small">
            Сданных заданий пока нет — колонки «Точность» заполнятся после первого сданного сета. Задайте сет в
            блоке «Задания» ниже. Сейчас видно только, какие темы проходили на уроках.
          </p>
        )
      )}

      <div className="sk-table" role="table" aria-label="Навыки">
        <div className="sk-row sk-headrow" role="row">
          <span role="columnheader">Навык</span>
          <span role="columnheader" title="Сколько уроков по теме в журнале">
            Уроки
          </span>
          <span role="columnheader">Точность в заданиях</span>
          <span role="columnheader">Объём · пропуски · время · динамика</span>
        </div>
        {DOMAINS.map((d) => {
          const domainTally = d.skills.reduce((t, s) => {
            const st = a?.skills.get(s.id)
            if (st) {
              t.total += st.total
              t.correct += st.correct
            }
            return t
          }, emptyTally())
          return (
            <div key={d.id} className="sk-domain" role="rowgroup">
              <div className="sk-domain-title">
                <span>{d.name}</span>
                {domainTally.total > 0 && (
                  <span className="muted">
                    {pct(accuracy(domainTally))} · {domainTally.total} вопр.
                  </span>
                )}
              </div>
              {d.skills.map((s) => (
                <SkillRow
                  key={s.id}
                  name={s.name}
                  lessons={lessonCounts.get(s.id) ?? 0}
                  st={a?.skills.get(s.id) ?? null}
                />
              ))}
            </div>
          )
        })}
      </div>

      {hasData && (
        <p className="small muted sk-legend">
          <span className="sk-dot sk-dot-weak" /> слабый навык — точность ниже {Math.round(WEAK_BELOW * 100)}% при
          выборке от {MIN_SAMPLE} вопросов; при меньшей выборке — «мало данных». Пропуск считается ошибкой.
          {a.unattributed > 0 && <> Вопросов без однозначного навыка (сет на несколько тем): {a.unattributed}.</>}
        </p>
      )}
    </section>
  )
}

function Summary({ a }: { a: Analytics }) {
  return (
    <div className="sk-summary">
      <div className="sk-kpi">
        <span className="sk-kpi-value">{pct(accuracy(a.overall))}</span>
        <span className="sk-kpi-label">
          точность · {a.overall.correct}/{a.overall.total} в {a.submitted} {plural(a.submitted, 'задании', 'заданиях', 'заданиях')}
        </span>
      </div>
      <div className="sk-kpi">
        <span className="sk-kpi-value">{formatDuration(avgTime(a.overall))}</span>
        <span className="sk-kpi-label">в среднем на вопрос · пропущено {pct(skipRate(a.overall))}</span>
      </div>
      {a.overallTrend && (
        <div className="sk-kpi">
          <span className="sk-kpi-value">
            <TrendBadge t={a.overallTrend} />
          </span>
          <span className="sk-kpi-label">
            ранние задания {pct(a.overallTrend.early)} → поздние {pct(a.overallTrend.late)}
          </span>
        </div>
      )}
      <div className="sk-diff">
        {DIFFICULTIES.map((d) => (
          <DiffPill key={d} label={DIFFICULTY_LABELS[d]} t={a.overallByDifficulty[d]} />
        ))}
      </div>
    </div>
  )
}

function DiffPill({ label, t, short }: { label: string; t: Tally; short?: boolean }) {
  if (!t.total) return short ? null : <span className="sk-pill sk-pill-off">{label}: —</span>
  return (
    <span className="sk-pill" title={`${label}: ${t.correct} из ${t.total}`}>
      {label} <b>{pct(accuracy(t))}</b>
      {!short && <span className="muted"> · {t.total}</span>}
    </span>
  )
}

function SkillRow({ name, lessons, st }: { name: string; lessons: number; st: SkillStats | null }) {
  const level = st?.level ?? 'none'
  const acc = st ? accuracy(st) : null
  const hasDiff = !!st && DIFFICULTIES.some((d) => st.byDifficulty[d].total > 0)

  return (
    <div className={`sk-row sk-${level}`} role="row">
      <span className="sk-name" role="cell">
        {name}
        {level === 'weak' && <span className="badge badge-unpaid">слабый</span>}
      </span>
      <span className={`sk-lessons ${lessons ? '' : 'muted'}`} role="cell" title={`Уроков по теме: ${lessons}`}>
        {lessons ? `×${lessons}` : '—'}
      </span>
      <span className="sk-acc" role="cell">
        <span className="sk-bar" aria-hidden="true">
          {acc !== null && <span className="sk-bar-fill" style={{ width: `${Math.max(2, acc * 100)}%` }} />}
        </span>
        <span className="sk-acc-value">
          {level === 'none' ? (
            <span className="muted">не решал</span>
          ) : (
            <>
              {pct(acc)}
              {level === 'few' && <span className="muted small"> мало данных</span>}
            </>
          )}
        </span>
      </span>
      <span className="sk-meta small" role="cell">
        {st && st.total > 0 ? (
          <>
            <span title="Правильно / всего вопросов">
              {st.correct}/{st.total}
            </span>
            <span title="Доля пропущенных вопросов">пропуски {pct(skipRate(st))}</span>
            <span title="Среднее время на вопрос">{formatDuration(avgTime(st))}</span>
            {st.trend && <TrendBadge t={st.trend} />}
            {hasDiff && (
              <span className="sk-diff-inline">
                {DIFFICULTIES.map((d) => (
                  <DiffPill key={d} label={d[0]} t={st.byDifficulty[d]} short />
                ))}
              </span>
            )}
          </>
        ) : (
          <span className="muted">—</span>
        )}
      </span>
    </div>
  )
}

function TrendBadge({ t }: { t: Trend }) {
  const pp = Math.round(t.delta * 100)
  const title = `Ранние задания: ${pct(t.early)} (${t.earlyN} вопр.) → поздние: ${pct(t.late)} (${t.lateN} вопр.)`
  if (t.direction === 'flat') {
    return (
      <span className="sk-trend sk-trend-flat" title={title}>
        <Minus size={13} aria-hidden="true" /> {pp > 0 ? '+' : ''}
        {pp} п.п.
      </span>
    )
  }
  const Icon = t.direction === 'up' ? TrendingUp : TrendingDown
  return (
    <span className={`sk-trend sk-trend-${t.direction}`} title={title}>
      <Icon size={13} aria-hidden="true" /> {pp > 0 ? '+' : ''}
      {pp} п.п.
    </span>
  )
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

// --- «Что задать дальше» ------------------------------------------------------------

export function NextSets({
  data,
  studentId,
  onAssigned,
}: {
  data: SkillData
  studentId: string
  onAssigned: () => void
}) {
  const { db } = useStore()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<{ title: string; token: string } | null>(null)

  const a = data.analytics
  const recs = useMemo(() => {
    if (!a || a.submitted === 0) return []
    const assigned = new Set(data.assignments.map((x) => x.setId))
    return recommendSets(a, db.materials, assigned, 3)
  }, [a, data.assignments, db.materials])

  const onAssign = async (setId: string, title: string) => {
    if (!supabase) return
    setBusy(setId)
    setError('')
    try {
      const created = await createAssignment(supabase, studentId, setId, '')
      setCreated({ title, token: created.token })
      onAssigned()
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="card">
      <h2>Что задать дальше</h2>
      {created && (
        <div className="sk-created small">
          <span>
            Задано: <strong>{created.title}</strong>. Отправьте ссылку ученику.
          </span>
          <CopyLink token={created.token} />
        </div>
      )}
      {error && <p className="error-text">{error}</p>}

      {data.loading && !a ? (
        <p className="muted">Загрузка…</p>
      ) : !a || a.submitted === 0 ? (
        <p className="muted">
          Подсказки появятся, когда ученик сдаст хотя бы одно задание: по результатам выберу сеты по самым слабым
          навыкам.
        </p>
      ) : recs.length === 0 ? (
        <p className="muted">
          Слабых навыков с невыданными сетами не нашлось — либо все навыки сильные, либо сеты по ним уже выданы.
        </p>
      ) : (
        <ul className="sk-recs">
          {recs.map((r) => (
            <li key={r.material.id} className="sk-rec">
              <div className="sk-rec-text">
                <strong>{skillName(r.skillId)}</strong>
                <span className="small muted">{r.reason}</span>
                <Link className="small sk-rec-set" to={`/sets/${r.material.setId}`}>
                  {r.material.title} <ArrowRight size={12} aria-hidden="true" />
                </Link>
              </div>
              <button
                className="btn btn-primary btn-small"
                disabled={busy !== null}
                onClick={() => onAssign(r.material.setId!, r.material.title)}
              >
                {busy === r.material.setId ? 'Создаю…' : 'Задать'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {recs.length > 0 && (
        <p className="small muted sk-legend">
          По одному ещё не выданному сету на навык: сначала слабые, затем с малой выборкой, затем нерешённые.
        </p>
      )}
    </section>
  )
}
