import { useEffect, useState, type ReactNode } from 'react'
import { ScoreChart } from '../components/ScoreChart'
import { daysUntil, plural, pluralDays } from '../dates'
import { fetchPortalHome, rememberPortal, type PortalAssignment, type PortalHome, type PortalVocab } from '../portal'
import { DOMAINS, skillName } from '../sat'
import { supabase } from '../supabase'
import { demoHome } from './demo'
import './portal.css'

// Кабинет ученика: постоянная ссылка #/me/<token>, без входа. Только чтение: отсюда ученик
// переходит к заданиям (#/solve/<token>) и в тренер слов (#/vocab/<token>).
// #/me/demo — демо с выдуманным учеником.

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))
/** Сколько сданных заданий видно до «Показать все» */
const DONE_PREVIEW = 5

/** «24 ноября» — дата (YYYY-MM-DD) или момент времени (ISO) по часам ученика. */
function shortDate(value: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value)
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

export function PortalApp({ token }: { token: string }) {
  const demo = token === 'demo'
  // undefined — грузится, null — ссылка не найдена
  const [home, setHome] = useState<PortalHome | null | undefined>(undefined)
  const [error, setError] = useState('')
  const [loadKey, setLoadKey] = useState(0)

  useEffect(() => {
    document.title = 'Мой кабинет — SAT Verbal'
    rememberPortal(token)
  }, [token])

  useEffect(() => {
    if (demo || !supabase) return
    let cancelled = false
    fetchPortalHome(supabase, token).then(
      (h) => {
        if (cancelled) return
        setHome(h)
        setError('')
      },
      (e: unknown) => !cancelled && setError(errText(e)),
    )
    return () => {
      cancelled = true
    }
  }, [demo, token, loadKey])

  if (demo) return <Home home={demoHome()} demo />

  if (!supabase) {
    return (
      <Message title="Сервис ещё не настроен">
        <p>Напишите преподавателю — ссылка заработает после настройки.</p>
      </Message>
    )
  }
  if (error) {
    return (
      <Message title="Не удалось загрузить кабинет">
        <p className="solve-error">{error}</p>
        <button
          className="sbtn sbtn-primary"
          onClick={() => {
            setError('')
            setHome(undefined)
            setLoadKey((k) => k + 1)
          }}
        >
          Попробовать ещё раз
        </button>
      </Message>
    )
  }
  if (home === undefined) {
    return (
      <div className="solve">
        <p className="solve-muted">Загрузка…</p>
      </div>
    )
  }
  if (home === null) {
    return (
      <Message title="Ссылка не найдена">
        <p>Проверьте ссылку или попросите преподавателя прислать её ещё раз.</p>
      </Message>
    )
  }
  return <Home home={home} demo={false} />
}

function Message({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="solve">
      <div className="solve-card">
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  )
}

function Home({ home, demo }: { home: PortalHome; demo: boolean }) {
  const todo = home.assignments
    .filter((a) => !a.submitted_at)
    // сначала с ближайшим сроком, без срока — в конце
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
  const done = home.assignments
    .filter((a) => a.submitted_at)
    .sort((a, b) => (b.submitted_at ?? '').localeCompare(a.submitted_at ?? ''))
  const vocab = home.vocab
  const vocabDone = Boolean(vocab && vocab.due === 0 && vocab.reviews_today > 0)

  const latest = home.scores.length ? home.scores[home.scores.length - 1].score : home.baseline_score
  const examIn = home.exam_date ? daysUntil(home.exam_date) : null
  const hasProgress = home.scores.length > 0 || home.lessons_count > 0

  return (
    <div className="solve">
      <div className="portal">
        <section className="pt-card">
          <p className="solve-muted">{home.student ? `${home.student}, привет!` : 'Привет!'}</p>
          <h1>Мой кабинет{demo && ' · демо'}</h1>
          <div className="pt-tiles">
            {examIn !== null && examIn >= 0 && (
              <Tile
                value={examIn === 0 ? 'сегодня' : examIn}
                label={examIn === 0 ? 'экзамен' : `${pluralDays(examIn)} до экзамена`}
                hint={shortDate(home.exam_date!)}
              />
            )}
            {latest !== null && <Tile value={latest} label={home.scores.length ? 'последний балл' : 'стартовый балл'} />}
            {home.target_score !== null && <Tile value={home.target_score} label="цель" />}
            {vocab && <Tile value={vocab.known} label={`${plural(vocab.known, 'слово', 'слова', 'слов')} выучено`} />}
          </div>
        </section>

        <section className="pt-card">
          <h2>Сделать сейчас</h2>
          {todo.length === 0 && (!vocab || vocabDone) && (
            <p className="solve-muted">Новых заданий нет — всё сделано.</p>
          )}
          <ul className="pt-list">
            {todo.map((a) => (
              <TodoRow key={a.token} a={a} demo={demo} />
            ))}
            {vocab && <VocabRow vocab={vocab} done={vocabDone} />}
          </ul>
        </section>

        {home.lesson && (
          <section className="pt-card">
            <h2>
              Последний урок <span className="pt-h-note">{shortDate(home.lesson.date)}</span>
            </h2>
            {home.lesson.topics.length > 0 && (
              <div className="pt-chips">
                {home.lesson.topics.map((t) => (
                  <span key={t} className="pt-chip pt-chip-on">
                    {skillName(t)}
                  </span>
                ))}
              </div>
            )}
            {home.lesson.homework ? (
              <div>
                <div className="pt-label">Домашнее задание</div>
                <p className="pt-homework">{home.lesson.homework}</p>
              </div>
            ) : (
              home.lesson.topics.length === 0 && <p className="solve-muted">Темы и задание к уроку не записаны.</p>
            )}
          </section>
        )}

        {done.length > 0 && <DoneCard done={done} demo={demo} />}

        {hasProgress && (
          <section className="pt-card">
            <h2>Прогресс</h2>
            {home.scores.length > 0 && (
              <div>
                <div className="pt-label">Баллы Reading & Writing на пробных тестах</div>
                <ScoreChart
                  scores={home.scores.map((s, i) => ({ id: String(i), studentId: '', notes: '', ...s }))}
                  baseline={home.baseline_score}
                  target={home.target_score}
                />
              </div>
            )}
            {home.lessons_count > 0 && (
              <div>
                <div className="pt-label">
                  Темы на уроках · {home.lessons_count} {plural(home.lessons_count, 'урок', 'урока', 'уроков')}
                </div>
                <div className="pt-coverage">
                  {DOMAINS.map((d) => (
                    <div key={d.id}>
                      <div className="pt-domain">{d.name}</div>
                      <div className="pt-chips">
                        {d.skills.map((s) => {
                          const n = home.topics[s.id] ?? 0
                          return (
                            <span key={s.id} className={`pt-chip ${n ? 'pt-chip-on' : 'pt-chip-off'}`}>
                              {s.name}
                              {n > 1 && <b> ×{n}</b>}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

function Tile({ value, label, hint }: { value: number | string; label: string; hint?: string }) {
  return (
    <div className="pt-tile" title={hint}>
      <span className="pt-tile-value">{value}</span>
      <span className="pt-tile-label">{label}</span>
    </div>
  )
}

/** Кнопка-ссылка на задание; в демо задания не открываются. */
function Go({ token, demo, primary, children }: { token: string; demo: boolean; primary?: boolean; children: ReactNode }) {
  const cls = `sbtn ${primary ? 'sbtn-primary' : ''}`
  if (demo) {
    return (
      <button className={cls} disabled title="В демо задания не открываются">
        {children}
      </button>
    )
  }
  return (
    <a className={cls} href={`#/solve/${token}`}>
      {children}
    </a>
  )
}

const sizeNote = (a: PortalAssignment) =>
  `${a.questions} ${plural(a.questions, 'вопрос', 'вопроса', 'вопросов')}${a.minutes ? ` · ${a.minutes} мин` : ''}`

function TodoRow({ a, demo }: { a: PortalAssignment; demo: boolean }) {
  const overdue = a.due_date ? daysUntil(a.due_date) < 0 : false
  return (
    <li className="pt-row">
      <div className="pt-row-main">
        <div className="pt-row-title">
          {a.title}
          {a.kind === 'test' && <span className="pt-tag">тест</span>}
        </div>
        <div className="pt-row-meta">
          {sizeNote(a)}
          {a.due_date && (
            <span className={overdue ? 'pt-overdue' : ''}>
              {' · '}
              {overdue ? 'срок был' : 'до'} {shortDate(a.due_date)}
            </span>
          )}
          {a.started_at && ' · начато'}
        </div>
      </div>
      <Go token={a.token} demo={demo} primary>
        {a.started_at ? 'Продолжить' : 'Начать'}
      </Go>
    </li>
  )
}

function VocabRow({ vocab, done }: { vocab: PortalVocab; done: boolean }) {
  return (
    <li className="pt-row">
      <div className="pt-row-main">
        <div className="pt-row-title">Слова на сегодня</div>
        <div className="pt-row-meta">
          {done
            ? 'Сегодня уже занимался ✓'
            : vocab.due > 0
              ? `${vocab.due} ${plural(vocab.due, 'слово ждёт', 'слова ждут', 'слов ждут')} повторения`
              : 'Новые слова и повторение — 10 минут'}
        </div>
      </div>
      <a className={`sbtn ${done ? '' : 'sbtn-primary'}`} href={`#/vocab/${vocab.token}`}>
        {done ? 'Открыть' : 'Тренировать'}
      </a>
    </li>
  )
}

function DoneCard({ done, demo }: { done: PortalAssignment[]; demo: boolean }) {
  const [all, setAll] = useState(false)
  const shown = all ? done : done.slice(0, DONE_PREVIEW)
  return (
    <section className="pt-card">
      <h2>Сданные задания</h2>
      <ul className="pt-list">
        {shown.map((a) => {
          const pct = a.total_count ? Math.round(((a.correct_count ?? 0) / a.total_count) * 100) : null
          return (
            <li key={a.token} className="pt-row">
              <div className="pt-row-main">
                <div className="pt-row-title">
                  {a.title}
                  {a.kind === 'test' && <span className="pt-tag">тест</span>}
                </div>
                <div className="pt-row-meta">
                  {shortDate(a.submitted_at!)}
                  {a.total_count !== null && ` · верно ${a.correct_count ?? 0} из ${a.total_count}`}
                  {a.score_estimate !== null && ` · примерно ${a.score_estimate} баллов`}
                </div>
              </div>
              {pct !== null && <span className="pt-pct">{pct}%</span>}
              <Go token={a.token} demo={demo}>
                Разбор
              </Go>
            </li>
          )
        })}
      </ul>
      {done.length > DONE_PREVIEW && !all && (
        <button className="pt-more" onClick={() => setAll(true)}>
          Показать все · {done.length}
        </button>
      )}
    </section>
  )
}
