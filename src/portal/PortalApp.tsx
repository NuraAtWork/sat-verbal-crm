import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardList,
  FileCheck2,
  Home as HomeIcon,
  Target,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { ScoreChart } from '../components/ScoreChart'
import { daysUntil, plural, pluralDays } from '../dates'
import {
  fetchPortalHome,
  rememberPortal,
  type PortalAssignment,
  type PortalHome,
  type PortalLesson,
  type PortalVocab,
} from '../portal'
import { DOMAINS, skillName } from '../sat'
import { supabase } from '../supabase'
import { demoHome } from './demo'
import './portal.css'

// Кабинет ученика: постоянная ссылка #/me/<token>[/<раздел>], без входа. Только чтение: отсюда ученик
// переходит к заданиям (#/solve/<token>) и в тренер слов (#/vocab/<token>).
// #/me/demo — демо с выдуманным учеником. Блоки-«затычки» (Soon) показывают, что появится позже.

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Минимум вопросов по навыку, чтобы называть его сильным или слабым (как MIN_SAMPLE в analytics.ts) */
const MIN_SAMPLE = 10
const WEAK_BELOW = 0.7
const STRONG_FROM = 0.85

const SECTIONS = [
  { id: 'home', label: 'Главная', icon: HomeIcon },
  { id: 'homework', label: 'Домашние задания', icon: ClipboardList },
  { id: 'tests', label: 'Разбор тестов', icon: FileCheck2 },
  { id: 'analytics', label: 'Аналитика', icon: BarChart3 },
  { id: 'lessons', label: 'Уроки', icon: CalendarDays },
  { id: 'exam', label: 'Путь к экзамену', icon: Target },
  { id: 'vocab', label: 'Словарь', icon: BookOpen },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon }[]

type SectionId = (typeof SECTIONS)[number]['id']

/** Раздел из адреса #/me/<token>/<раздел>; неизвестный — главная. */
function sectionFromHash(): SectionId {
  const raw = window.location.hash.split('/')[3] ?? ''
  return SECTIONS.find((s) => s.id === raw)?.id ?? 'home'
}

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

  if (demo) return <Cabinet home={demoHome()} token={token} demo />

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
  return <Cabinet home={home} token={token} demo={false} />
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

// --- Каркас: боковая панель и разделы ------------------------------------------------

/** Всё, что разделы вычисляют из ответа сервера. */
interface View {
  home: PortalHome
  demo: boolean
  /** Адрес раздела кабинета */
  link: (id: SectionId) => string
  todo: PortalAssignment[]
  done: PortalAssignment[]
  vocabDone: boolean
  latest: number | null
  examIn: number | null
}

function Cabinet({ home, token, demo }: { home: PortalHome; token: string; demo: boolean }) {
  const [section, setSection] = useState<SectionId>(sectionFromHash)

  useEffect(() => {
    const onHash = () => {
      setSection(sectionFromHash())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const link = (id: SectionId) => `#/me/${token}${id === 'home' ? '' : `/${id}`}`
  const vocab = home.vocab
  const view: View = {
    home,
    demo,
    link,
    todo: home.assignments
      .filter((a) => !a.submitted_at)
      // сначала с ближайшим сроком, без срока — в конце
      .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')),
    done: home.assignments
      .filter((a) => a.submitted_at)
      .sort((a, b) => (b.submitted_at ?? '').localeCompare(a.submitted_at ?? '')),
    vocabDone: Boolean(vocab && vocab.due === 0 && vocab.reviews_today > 0),
    latest: home.scores.length ? home.scores[home.scores.length - 1].score : home.baseline_score,
    examIn: home.exam_date ? daysUntil(home.exam_date) : null,
  }

  const badges: Partial<Record<SectionId, number>> = {
    homework: view.todo.filter((a) => a.kind !== 'test').length,
    tests: view.todo.filter((a) => a.kind === 'test').length,
    vocab: vocab && !view.vocabDone ? vocab.due : 0,
  }

  return (
    <div className="solve portal">
      <aside className="pt-side">
        <div className="pt-brand">
          <span className="pt-brand-mark" aria-hidden="true">
            V
          </span>
          <span>
            {home.student ?? 'Мой кабинет'}
            <small>SAT Reading &amp; Writing{demo && ' · демо'}</small>
          </span>
        </div>
        <nav className="pt-nav" aria-label="Разделы кабинета">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <a key={id} href={link(id)} className={id === section ? 'active' : ''} aria-current={id === section ? 'page' : undefined}>
              <Icon size={16} strokeWidth={2} aria-hidden="true" />
              <span>{label}</span>
              {badges[id] ? <b className="pt-badge">{badges[id]}</b> : null}
            </a>
          ))}
        </nav>
        {view.examIn !== null && view.examIn >= 0 && (
          <a className="pt-side-exam" href={link('exam')}>
            <strong>{view.examIn === 0 ? 'Экзамен сегодня' : `${view.examIn} ${pluralDays(view.examIn)}`}</strong>
            {view.examIn > 0 && <span>до экзамена · {shortDate(home.exam_date!)}</span>}
          </a>
        )}
      </aside>
      <main className="pt-main">
        {section === 'home' && <HomeSection v={view} />}
        {section === 'homework' && <HomeworkSection v={view} />}
        {section === 'tests' && <TestsSection v={view} />}
        {section === 'analytics' && <AnalyticsSection v={view} />}
        {section === 'lessons' && <LessonsSection v={view} />}
        {section === 'exam' && <ExamSection v={view} />}
        {section === 'vocab' && <VocabSection v={view} />}
      </main>
    </div>
  )
}

// --- Общие детали --------------------------------------------------------------------

function Head({ title, note }: { title: string; note?: string }) {
  return (
    <header className="pt-head">
      <h1>{title}</h1>
      {note && <p className="solve-muted">{note}</p>}
    </header>
  )
}

function Card({ title, note, children }: { title?: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="pt-card">
      {title && (
        <h2>
          {title} {note && <span className="pt-h-note">{note}</span>}
        </h2>
      )}
      {children}
    </section>
  )
}

/** «Затычка»: блок, которого пока нет, — чтобы было видно, что здесь появится. */
function Soon({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pt-card pt-soon">
      <h2>
        {title} <span className="pt-soon-tag">скоро</span>
      </h2>
      <p className="solve-muted">{children}</p>
    </section>
  )
}

function Tiles({ children }: { children: ReactNode }) {
  return <div className="pt-tiles">{children}</div>
}

function Tile({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="pt-tile">
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

function DoneRow({ a, demo }: { a: PortalAssignment; demo: boolean }) {
  const pct = a.total_count ? Math.round(((a.correct_count ?? 0) / a.total_count) * 100) : null
  return (
    <li className="pt-row">
      <div className="pt-row-main">
        <div className="pt-row-title">{a.title}</div>
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

function LessonBody({ lesson }: { lesson: PortalLesson }) {
  return (
    <>
      {lesson.topics.length > 0 && (
        <div className="pt-chips">
          {lesson.topics.map((t) => (
            <span key={t} className="pt-chip pt-chip-on">
              {skillName(t)}
            </span>
          ))}
        </div>
      )}
      {lesson.homework ? (
        <div>
          <div className="pt-label">Домашнее задание</div>
          <p className="pt-homework">{lesson.homework}</p>
        </div>
      ) : (
        lesson.topics.length === 0 && <p className="solve-muted">Темы и задание к уроку не записаны.</p>
      )}
    </>
  )
}

// --- Разделы -------------------------------------------------------------------------

function HomeSection({ v }: { v: View }) {
  const { home, todo, vocabDone } = v
  const vocab = home.vocab
  const lesson = home.lessons[0]
  return (
    <>
      <Head title={home.student ? `${home.student}, привет!` : 'Привет!'} note="Что сделать сегодня и где ты сейчас." />
      <Tiles>
        {v.examIn !== null && v.examIn >= 0 && (
          <Tile value={v.examIn === 0 ? 'сегодня' : v.examIn} label={v.examIn === 0 ? 'экзамен' : `${pluralDays(v.examIn)} до экзамена`} />
        )}
        {v.latest !== null && <Tile value={v.latest} label={home.scores.length ? 'последний балл' : 'стартовый балл'} />}
        {home.target_score !== null && <Tile value={home.target_score} label="цель" />}
        <Tile value={todo.length} label={plural(todo.length, 'задание ждёт', 'задания ждут', 'заданий ждут')} />
      </Tiles>

      <Card title="Сделать сейчас">
        {todo.length === 0 && (!vocab || vocabDone) && <p className="solve-muted">Новых заданий нет — всё сделано.</p>}
        <ul className="pt-list">
          {todo.slice(0, 4).map((a) => (
            <TodoRow key={a.token} a={a} demo={v.demo} />
          ))}
          {vocab && <VocabRow vocab={vocab} done={vocabDone} />}
        </ul>
        {todo.length > 4 && (
          <a className="pt-more" href={v.link('homework')}>
            Все задания · {todo.length}
          </a>
        )}
      </Card>

      {lesson && (
        <Card title="Последний урок" note={shortDate(lesson.date)}>
          <LessonBody lesson={lesson} />
          <a className="pt-more" href={v.link('lessons')}>
            Все уроки
          </a>
        </Card>
      )}
    </>
  )
}

function HomeworkSection({ v }: { v: View }) {
  const todo = v.todo.filter((a) => a.kind !== 'test')
  const done = v.done.filter((a) => a.kind !== 'test')
  const lesson = v.home.lessons.find((l) => l.homework)
  return (
    <>
      <Head title="Домашние задания" note="Сеты вопросов от преподавателя: что нужно решить и что уже сдано." />
      <Card title="Нужно сделать" note={todo.length ? String(todo.length) : undefined}>
        {todo.length === 0 && <p className="solve-muted">Несданных заданий нет.</p>}
        <ul className="pt-list">
          {todo.map((a) => (
            <TodoRow key={a.token} a={a} demo={v.demo} />
          ))}
        </ul>
      </Card>
      {lesson && (
        <Card title="Задание с урока" note={shortDate(lesson.date)}>
          <p className="pt-homework">{lesson.homework}</p>
        </Card>
      )}
      <Card title="Сдано" note={done.length ? String(done.length) : undefined}>
        {done.length === 0 && <p className="solve-muted">Сданные задания появятся здесь вместе с разбором.</p>}
        <ul className="pt-list">
          {done.map((a) => (
            <DoneRow key={a.token} a={a} demo={v.demo} />
          ))}
        </ul>
      </Card>
      <Soon title="Работа над ошибками">
        Повторное решение вопросов, в которых ты ошибся, — отдельным коротким заданием.
      </Soon>
    </>
  )
}

function TestsSection({ v }: { v: View }) {
  const todo = v.todo.filter((a) => a.kind === 'test')
  const done = v.done.filter((a) => a.kind === 'test')
  return (
    <>
      <Head title="Разбор тестов" note="Пробные тесты в формате экзамена: модули с таймером, после сдачи — оценка балла и разбор." />
      {todo.length > 0 && (
        <Card title="Нужно пройти">
          <ul className="pt-list">
            {todo.map((a) => (
              <TodoRow key={a.token} a={a} demo={v.demo} />
            ))}
          </ul>
        </Card>
      )}
      <Card title="Пройденные тесты" note={done.length ? String(done.length) : undefined}>
        {done.length === 0 && (
          <p className="solve-muted">Пройденных тестов пока нет. После сдачи здесь будет балл и разбор каждого вопроса.</p>
        )}
        <ul className="pt-list">
          {done.map((a) => (
            <DoneRow key={a.token} a={a} demo={v.demo} />
          ))}
        </ul>
      </Card>
      <Soon title="Разбор по типам ошибок">
        Сводка по каждому тесту: в каких навыках потеряны баллы, где не хватило времени и какие вопросы пропущены.
      </Soon>
      <Soon title="Комментарий преподавателя">Заметки преподавателя к тесту: что разобрать на следующем уроке.</Soon>
    </>
  )
}

function AnalyticsSection({ v }: { v: View }) {
  const { skills } = v.home
  const all = Object.values(skills)
  const total = all.reduce((a, s) => a + s.total, 0)
  const correct = all.reduce((a, s) => a + s.correct, 0)
  const time = all.reduce((a, s) => a + s.time_sec, 0)
  return (
    <>
      <Head title="Аналитика" note="Как ты решаешь вопросы каждого типа — по всем сданным заданиям и тестам." />
      {total === 0 ? (
        <Card>
          <p className="solve-muted">Данных пока нет: аналитика появится после первых сданных заданий.</p>
        </Card>
      ) : (
        <>
          <Tiles>
            <Tile value={`${Math.round((correct / total) * 100)}%`} label="верных ответов" />
            <Tile value={total} label={plural(total, 'вопрос решён', 'вопроса решено', 'вопросов решено')} />
            <Tile value={`${Math.round(time / total)} с`} label="в среднем на вопрос" />
          </Tiles>
          <Card title="Точность по навыкам">
            <div className="pt-skills">
              {DOMAINS.map((d) => (
                <div key={d.id}>
                  <div className="pt-domain">{d.name}</div>
                  {d.skills.map((s) => {
                    const st = skills[s.id]
                    const acc = st && st.total ? st.correct / st.total : null
                    const level =
                      acc === null || st.total < MIN_SAMPLE ? 'few' : acc < WEAK_BELOW ? 'weak' : acc >= STRONG_FROM ? 'strong' : 'ok'
                    return (
                      <div key={s.id} className={`pt-skill pt-skill-${level}`}>
                        <span className="pt-skill-name">{s.name}</span>
                        <span className="pt-bar" aria-hidden="true">
                          <span style={{ width: `${acc === null ? 0 : Math.round(acc * 100)}%` }} />
                        </span>
                        <span className="pt-skill-num">
                          {acc === null ? '—' : `${Math.round(acc * 100)}%`}
                          <small>{st ? `${st.correct}/${st.total}` : 'не решал'}</small>
                        </span>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
            <p className="solve-muted pt-fine">
              Красным — навыки с точностью ниже 70%, зелёным — от 85%. Серым — пока меньше {MIN_SAMPLE} вопросов, выводы
              делать рано.
            </p>
          </Card>
        </>
      )}
      <Soon title="Динамика">Как меняется точность от недели к неделе — по каждому навыку.</Soon>
      <Soon title="Сложность и время">Точность на лёгких, средних и сложных вопросах и где уходит больше всего времени.</Soon>
    </>
  )
}

function LessonsSection({ v }: { v: View }) {
  const { lessons, lessons_count, topics } = v.home
  return (
    <>
      <Head title="Уроки" note="Что проходили на занятиях и что было задано." />
      <Soon title="Следующий урок">Дата и время ближайшего занятия и что к нему подготовить.</Soon>
      {lessons_count > 0 && (
        <Card title="Пройденные темы" note={`${lessons_count} ${plural(lessons_count, 'урок', 'урока', 'уроков')}`}>
          <div className="pt-coverage">
            {DOMAINS.map((d) => (
              <div key={d.id}>
                <div className="pt-domain">{d.name}</div>
                <div className="pt-chips">
                  {d.skills.map((s) => {
                    const n = topics[s.id] ?? 0
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
        </Card>
      )}
      <Card title="История уроков">
        {lessons.length === 0 && <p className="solve-muted">Уроков пока не было.</p>}
        <ul className="pt-lessons">
          {lessons.map((l, i) => (
            <li key={`${l.date}-${i}`}>
              <div className="pt-lesson-date">
                {shortDate(l.date)}
                {l.duration_min > 0 && <span> · {l.duration_min} мин</span>}
              </div>
              <LessonBody lesson={l} />
            </li>
          ))}
        </ul>
      </Card>
      <Soon title="Материалы урока">Конспекты, теория и ссылки, которые преподаватель прикрепил к уроку.</Soon>
    </>
  )
}

function ExamSection({ v }: { v: View }) {
  const { home, latest, examIn } = v
  const { baseline_score: start, target_score: target } = home
  const left = target !== null && latest !== null ? Math.max(0, target - latest) : null
  // доля пути от старта до цели
  const share =
    start !== null && target !== null && latest !== null && target > start
      ? Math.min(1, Math.max(0, (latest - start) / (target - start)))
      : null
  return (
    <>
      <Head title="Путь к экзамену" note="Откуда начали, где ты сейчас и сколько осталось до цели." />
      <Tiles>
        {examIn !== null && examIn >= 0 ? (
          <Tile value={examIn === 0 ? 'сегодня' : examIn} label={examIn === 0 ? 'экзамен' : `${pluralDays(examIn)} до экзамена`} />
        ) : (
          <Tile value="—" label={home.exam_date ? 'экзамен прошёл' : 'дата экзамена не назначена'} />
        )}
        {latest !== null && <Tile value={latest} label={home.scores.length ? 'последний балл' : 'стартовый балл'} />}
        {target !== null && <Tile value={target} label="цель" />}
        {left !== null && <Tile value={left === 0 ? '✓' : `+${left}`} label={left === 0 ? 'цель достигнута' : 'осталось набрать'} />}
      </Tiles>

      {share !== null && (
        <Card title="От старта до цели">
          <div className="pt-path">
            <span className="pt-bar pt-bar-big" aria-hidden="true">
              <span style={{ width: `${Math.round(share * 100)}%` }} />
            </span>
            <div className="pt-path-ends">
              <span>старт {start}</span>
              <strong>пройдено {Math.round(share * 100)}%</strong>
              <span>цель {target}</span>
            </div>
          </div>
        </Card>
      )}

      <Card title="Баллы на пробных тестах">
        {home.scores.length === 0 ? (
          <p className="solve-muted">Баллов пока нет — они появятся после первого пробного теста.</p>
        ) : (
          <>
            <ScoreChart
              scores={home.scores.map((s, i) => ({ id: String(i), studentId: '', notes: '', ...s }))}
              baseline={start}
              target={target}
            />
            <ul className="pt-list">
              {[...home.scores].reverse().map((s, i) => (
                <li key={i} className="pt-row">
                  <div className="pt-row-main">
                    <div className="pt-row-title">{s.source || 'Пробный тест'}</div>
                    <div className="pt-row-meta">{shortDate(s.date)}</div>
                  </div>
                  <span className="pt-pct">{s.score}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <Soon title="План до экзамена">
        План по неделям: какие темы осталось пройти, когда пробные тесты и что повторить в последние дни.
      </Soon>
    </>
  )
}

function VocabSection({ v }: { v: View }) {
  const vocab = v.home.vocab
  return (
    <>
      <Head title="Словарь" note="Тренажёр слов для вопросов Words in Context: каждый день понемногу." />
      {!vocab ? (
        <Card>
          <p className="solve-muted">Тренажёр слов пока не включён — попроси преподавателя его открыть.</p>
        </Card>
      ) : (
        <>
          <Tiles>
            <Tile value={vocab.due} label={plural(vocab.due, 'слово ждёт повторения', 'слова ждут повторения', 'слов ждут повторения')} />
            <Tile value={vocab.started - vocab.known} label="в работе" />
            <Tile value={vocab.known} label="выучено" />
          </Tiles>
          <Card title="Тренировка на сегодня">
            <ul className="pt-list">
              <VocabRow vocab={vocab} done={v.vocabDone} />
            </ul>
            <p className="solve-muted pt-fine">
              Слова из вопросов, где ты ошибся, попадают в тренажёр сами. В разборе задания можно нажать на незнакомое
              слово — оно тоже добавится.
            </p>
          </Card>
        </>
      )}
      <Soon title="Мои слова">Список всех твоих слов: выученные, в работе и трудные — с определением и переводом.</Soon>
    </>
  )
}
