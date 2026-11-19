import type { SupabaseClient } from '@supabase/supabase-js'
import DOMPurify from 'dompurify'
import { Bookmark, ChevronDown, ChevronLeft, ChevronRight, Eye, EyeOff, Flag } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { QuestionView } from '../components/QuestionView'
import { PortalBack } from '../portal/PortalBack'
import { WordLookup } from '../vocab/WordLookup'
import { formatDate } from '../dates'
import {
  estimateRwScore,
  formatDuration,
  startTestModule,
  submitTestModule,
  type StudentAssignment,
  type TestSubmitResult,
} from '../sets'
import type { QuestionResult, SetQuestion, TestModule } from '../types'
import './test.css'

// Пробный тест в формате, близком к Bluebook: модули с общим таймером, свободная навигация внутри модуля,
// отметки «проверить позже», вычёркивание вариантов. Время модуля считает сервер (module_starts),
// поэтому перезагрузка страницы таймер не сбрасывает. Ключ и объяснения приходят только после сдачи.

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

function Html({ html, className }: { html: string; className?: string }) {
  const clean = useMemo(
    () => DOMPurify.sanitize(html, { USE_PROFILES: { html: true, svg: true }, FORBID_TAGS: ['style'] }),
    [html],
  )
  if (!clean) return null
  return <div className={className} dangerouslySetInnerHTML={{ __html: clean }} />
}

interface ModuleProgress {
  answers: (string | null)[]
  /** секунды на каждый вопрос (сумма всех заходов) */
  times: number[]
  marked: boolean[]
  /** вычеркнутые буквы по вопросам */
  crossed: string[][]
  /** индекс вопроса; === count — экран проверки ответов */
  current: number
}

const progressKey = (token: string, m: number) => `sat-test:${token}:m${m}`

function loadProgress(token: string, m: number, count: number): ModuleProgress {
  const empty: ModuleProgress = {
    answers: Array(count).fill(null),
    times: Array(count).fill(0),
    marked: Array(count).fill(false),
    crossed: Array.from({ length: count }, () => []),
    current: 0,
  }
  try {
    const raw = localStorage.getItem(progressKey(token, m))
    if (!raw) return empty
    const p = JSON.parse(raw) as ModuleProgress
    if (!Array.isArray(p.answers) || p.answers.length !== count) return empty
    return { ...empty, ...p }
  } catch {
    return empty
  }
}

function saveProgress(token: string, m: number, p: ModuleProgress) {
  try {
    localStorage.setItem(progressKey(token, m), JSON.stringify(p))
  } catch {
    /* хранилище недоступно — прогресс живёт только в памяти */
  }
}

function clearProgress(token: string, modules: number) {
  try {
    for (let m = 0; m < modules; m++) localStorage.removeItem(progressKey(token, m))
  } catch {
    /* ничего */
  }
}

const plural = (n: number, one: string, few: string, many: string) => {
  const a = n % 100
  const b = n % 10
  if (a > 10 && a < 20) return many
  if (b === 1) return one
  if (b >= 2 && b <= 4) return few
  return many
}

/** «32:00» — обратный отсчёт */
const clock = (sec: number) => {
  const s = Math.max(0, Math.ceil(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function moduleRanges(modules: TestModule[]) {
  let start = 0
  return modules.map((m) => {
    const r = { start, end: start + m.count }
    start += m.count
    return r
  })
}

function resultFromData(data: StudentAssignment): TestSubmitResult | null {
  if (!data.submitted_at || !data.results) return null
  return {
    modules_done: data.modules_done ?? 0,
    submitted_at: data.submitted_at,
    duration_sec: data.duration_sec,
    correct_count: data.correct_count,
    total_count: data.total_count,
    results: data.results,
    score_estimate: data.score_estimate,
    explanations: data.explanations,
  }
}

export function TestSolve({ sb, token, data }: { sb: SupabaseClient; token: string; data: StudentAssignment }) {
  const modules = useMemo<TestModule[]>(
    () => data.modules ?? [{ title: 'Модуль 1', count: data.questions.length, minutes: 32 }],
    [data],
  )
  const ranges = useMemo(() => moduleRanges(modules), [modules])
  const [starts, setStarts] = useState<string[]>(data.module_starts ?? [])
  const [done, setDone] = useState(data.modules_done ?? 0)
  // разница часов сервера и браузера, мс
  const [offset, setOffset] = useState(() => (data.server_now ? Date.parse(data.server_now) - Date.now() : 0))
  const [result, setResult] = useState<TestSubmitResult | null>(() => resultFromData(data))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const onStart = async (m: number) => {
    setBusy(true)
    setError('')
    try {
      const st = await startTestModule(sb, token, m + 1)
      setOffset(Date.parse(st.server_now) - Date.now())
      setStarts(st.module_starts ?? [])
      setDone(st.modules_done)
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const onSubmitModule = useCallback(
    async (m: number, p: ModuleProgress) => {
      setBusy(true)
      setError('')
      try {
        const r = await submitTestModule(sb, token, m + 1, p.answers, p.times)
        setDone(r.modules_done)
        if (r.submitted_at && r.results) {
          clearProgress(token, modules.length)
          setResult(r)
        }
      } catch (e) {
        setError(errText(e))
      } finally {
        setBusy(false)
      }
    },
    [sb, token, modules.length],
  )

  if (result) return <TestResults token={token} data={data} modules={modules} result={result} />

  // модуль открыт и ещё не сдан
  if (starts.length > done && done < modules.length) {
    const m = done
    const r = ranges[m]
    return (
      <ModulePlayer
        key={m}
        token={token}
        title={data.title}
        moduleIndex={m}
        moduleCount={modules.length}
        module={modules[m]}
        questions={data.questions.slice(r.start, r.end)}
        startMs={Date.parse(starts[m])}
        offset={offset}
        busy={busy}
        error={error}
        onSubmit={(p) => onSubmitModule(m, p)}
      />
    )
  }

  const total = modules.reduce((a, m) => a + m.count, 0)

  if (done === 0) {
    return (
      <div className="solve-card tp-intro">
        <PortalBack />
        <p className="solve-muted">{data.student ? `${data.student}, привет!` : 'Привет!'}</p>
        <h1>{data.title}</h1>
        <p className="tp-kicker">Пробный тест · Reading and Writing</p>
        <table className="tp-modtable">
          <tbody>
            {modules.map((m, i) => (
              <tr key={i}>
                <td>{m.title || `Модуль ${i + 1}`}</td>
                <td>
                  {m.count} {plural(m.count, 'вопрос', 'вопроса', 'вопросов')}
                </td>
                <td>{m.minutes} мин</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="solve-facts">
          <li>
            Всего {total} {plural(total, 'вопрос', 'вопроса', 'вопросов')}. Проходи в один заход, как на настоящем
            экзамене.
          </li>
          <li>
            У каждого модуля свой таймер. Он идёт непрерывно с момента старта — даже если закрыть вкладку. Когда время
            выйдет, модуль закроется сам и ответы отправятся.
          </li>
          <li>
            Внутри модуля можно переходить между вопросами, отмечать вопросы флажком «Проверить позже» и вычёркивать
            варианты (кнопка <s>ABC</s>).
          </li>
          <li>После сдачи модуля вернуться к нему нельзя.</li>
          <li>Неверный ответ не снимает баллы — лучше ответить на все вопросы.</li>
          {data.due_date && <li>Сдать до {formatDate(data.due_date)}.</li>}
          <li>После теста увидишь результат по модулям, оценку балла и разбор ошибок.</li>
        </ul>
        {error && <p className="solve-error">Не получилось начать: {error}</p>}
        <button className="sbtn sbtn-primary sbtn-big" onClick={() => onStart(0)} disabled={busy}>
          {busy ? 'Открываю…' : `Начать ${(modules[0].title || 'модуль 1').toLowerCase()}`}
        </button>
      </div>
    )
  }

  // между модулями
  const next = modules[done]
  return (
    <div className="solve-card tp-intro">
      <p className="tp-kicker">
        {modules[done - 1].title || `Модуль ${done}`} сдан ✓
      </p>
      <h1>Дальше — {next.title || `модуль ${done + 1}`}</h1>
      <ul className="solve-facts">
        <li>
          {next.count} {plural(next.count, 'вопрос', 'вопроса', 'вопросов')}, {next.minutes} {plural(next.minutes, 'минута', 'минуты', 'минут')}. Таймер стартует
          после кнопки «Начать».
        </li>
        <li>Вернуться к предыдущему модулю нельзя.</li>
        <li>Если нужен перерыв — сделай его сейчас, до старта модуля.</li>
      </ul>
      {error && <p className="solve-error">Не получилось начать: {error}</p>}
      <button className="sbtn sbtn-primary sbtn-big" onClick={() => onStart(done)} disabled={busy}>
        {busy ? 'Открываю…' : `Начать ${(next.title || `модуль ${done + 1}`).toLowerCase()}`}
      </button>
    </div>
  )
}

// --- Модуль ----------------------------------------------------------------------------------------

function ModulePlayer(props: {
  token: string
  title: string
  moduleIndex: number
  moduleCount: number
  module: TestModule
  questions: SetQuestion[]
  startMs: number
  offset: number
  busy: boolean
  error: string
  onSubmit: (p: ModuleProgress) => void
}) {
  const { token, title, moduleIndex, moduleCount, module, questions, startMs, offset, busy, error, onSubmit } = props
  const n = questions.length
  const [p, setP] = useState<ModuleProgress>(() => loadProgress(token, moduleIndex, n))
  const [now, setNow] = useState(() => Date.now())
  const [hideTimer, setHideTimer] = useState(false)
  const [crossMode, setCrossMode] = useState(false)
  const [navOpen, setNavOpen] = useState(false)

  const deadline = startMs + module.minutes * 60_000
  const remaining = (deadline - (now + offset)) / 1000
  const expired = remaining <= 0

  // время по вопросам копим в ref и считаем только пока вкладка видна
  const pRef = useRef(p)
  const last = useRef(0)
  const visible = useRef(true)
  const submitted = useRef(false)
  const [sent, setSent] = useState(false)

  const commit = useCallback(
    (next: ModuleProgress) => {
      pRef.current = next
      setP(next)
      saveProgress(token, moduleIndex, next)
    },
    [token, moduleIndex],
  )

  const flush = useCallback(() => {
    const t = performance.now()
    const cur = pRef.current.current
    if (visible.current && cur < n) pRef.current.times[cur] += (t - last.current) / 1000
    last.current = t
    visible.current = document.visibilityState === 'visible'
  }, [n])

  useEffect(() => {
    last.current = performance.now()
    visible.current = document.visibilityState === 'visible'
    const id = window.setInterval(() => {
      flush()
      saveProgress(token, moduleIndex, pRef.current)
      setNow(Date.now())
    }, 1000)
    const onVisibility = () => {
      flush()
      saveProgress(token, moduleIndex, pRef.current)
      setNow(Date.now())
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onVisibility)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onVisibility)
    }
  }, [flush, token, moduleIndex])

  const send = useCallback(() => {
    flush()
    submitted.current = true
    setSent(true)
    const cur = pRef.current
    onSubmit({ ...cur, times: cur.times.map((t) => Math.round(t)) })
  }, [flush, onSubmit])

  // время вышло — модуль закрывается сам (один раз; при ошибке сети — кнопка «Отправить ещё раз»)
  useEffect(() => {
    if (expired && !submitted.current && !busy) send()
  }, [expired, busy, send])

  const goTo = (i: number) => {
    if (i < 0 || i > n) return
    flush()
    commit({ ...pRef.current, current: i })
    setNavOpen(false)
    window.scrollTo({ top: 0 })
  }

  const update = (fn: (draft: ModuleProgress) => void) => {
    const cur = pRef.current
    const next: ModuleProgress = {
      ...cur,
      answers: [...cur.answers],
      marked: [...cur.marked],
      crossed: cur.crossed.map((c) => [...c]),
    }
    fn(next)
    commit(next)
  }

  const choose = (letter: string) =>
    update((d) => {
      const i = d.current
      d.answers[i] = d.answers[i] === letter ? null : letter
      d.crossed[i] = d.crossed[i].filter((l) => l !== letter)
    })

  const toggleCross = (letter: string) =>
    update((d) => {
      const i = d.current
      const has = d.crossed[i].includes(letter)
      d.crossed[i] = has ? d.crossed[i].filter((l) => l !== letter) : [...d.crossed[i], letter]
      if (!has && d.answers[i] === letter) d.answers[i] = null
    })

  const toggleMark = () =>
    update((d) => {
      d.marked[d.current] = !d.marked[d.current]
    })

  const finish = () => {
    const unanswered = pRef.current.answers.filter((a) => !a).length
    const last = moduleIndex === moduleCount - 1
    const what = last ? 'Сдать тест' : 'Сдать модуль'
    const msg = unanswered
      ? `Без ответа: ${unanswered}. ${what}? Вернуться к этому модулю будет нельзя.`
      : `${what}? Вернуться к этому модулю будет нельзя.`
    if (!confirm(msg)) return
    send()
  }

  const cur = p.current
  const q = cur < n ? questions[cur] : null
  const answered = p.answers.filter(Boolean).length
  const warn = remaining <= 300
  const isLast = moduleIndex === moduleCount - 1

  return (
    <div className="tp tp-module">
      <header className="tp-top">
        <div className="tp-top-title">
          <strong>{module.title || `Модуль ${moduleIndex + 1}`}</strong>
          <span>{title}</span>
        </div>
        <div className={`tp-timer ${warn ? 'tp-timer-warn' : ''}`} aria-live="off">
          {hideTimer && !warn ? <span className="tp-timer-hidden">⏱</span> : clock(remaining)}
          <button className="tp-link" onClick={() => setHideTimer((h) => !h)} title={hideTimer ? 'Показать' : 'Скрыть'}>
            {hideTimer ? <Eye size={14} aria-hidden /> : <EyeOff size={14} aria-hidden />}
            {hideTimer ? 'Показать' : 'Скрыть'}
          </button>
        </div>
        <div className="tp-top-right">
          <button
            className={`tp-tool ${crossMode ? 'is-on' : ''}`}
            onClick={() => setCrossMode((c) => !c)}
            title="Вычёркивание вариантов"
            aria-pressed={crossMode}
          >
            <s>ABC</s>
          </button>
        </div>
      </header>

      {(error || (expired && !busy && sent)) && (
        <div className="tp-alert">
          {expired ? 'Время модуля вышло. ' : ''}
          {error ? `Не удалось отправить ответы: ${error}. ` : ''}
          {error && (
            <button className="sbtn sbtn-primary" onClick={send} disabled={busy}>
              Отправить ещё раз
            </button>
          )}
        </div>
      )}
      {busy && <div className="tp-alert tp-alert-info">Отправляю ответы…</div>}

      {q ? (
        <main className={`tp-body ${q.stimulus ? 'tp-split' : ''}`}>
          {q.stimulus && (
            <section className="tp-pane tp-passage paper">
              <Html className="setq-stimulus" html={q.stimulus} />
            </section>
          )}
          <section className="tp-pane tp-question paper">
            <div className="tp-qhead">
              <span className="tp-qnum">{cur + 1}</span>
              <button className={`tp-mark ${p.marked[cur] ? 'is-on' : ''}`} onClick={toggleMark} aria-pressed={p.marked[cur]}>
                <Bookmark size={15} aria-hidden fill={p.marked[cur] ? 'currentColor' : 'none'} />
                Проверить позже
              </button>
            </div>
            <Html className="setq-stem tp-stem" html={q.stem} />
            <ol className="tp-choices">
              {q.choices.map((c) => {
                const selected = p.answers[cur] === c.letter
                const crossed = p.crossed[cur]?.includes(c.letter)
                return (
                  <li key={c.letter} className="tp-choice-row">
                    <button
                      type="button"
                      className={`tp-choice ${selected ? 'is-selected' : ''} ${crossed ? 'is-crossed' : ''}`}
                      onClick={() => choose(c.letter)}
                      aria-pressed={selected}
                      disabled={busy}
                    >
                      <span className="tp-ltr">{c.letter}</span>
                      <Html className="tp-ct" html={c.html} />
                    </button>
                    {crossMode && (
                      <button
                        type="button"
                        className="tp-cross"
                        onClick={() => toggleCross(c.letter)}
                        title={crossed ? 'Вернуть вариант' : 'Вычеркнуть вариант'}
                      >
                        {crossed ? 'Вернуть' : <s>{c.letter}</s>}
                      </button>
                    )}
                  </li>
                )
              })}
            </ol>
          </section>
        </main>
      ) : (
        <main className="tp-review paper">
          <h2>Проверь ответы</h2>
          <p className="solve-muted">
            Отвечено {answered} из {n}. Нажми на номер, чтобы вернуться к вопросу. После сдачи модуль закроется.
          </p>
          <NavGrid p={p} current={cur} onGo={goTo} />
          <div className="tp-review-actions">
            <button className="sbtn sbtn-primary sbtn-big" onClick={finish} disabled={busy || (sent && !error)}>
              {isLast ? 'Сдать тест' : 'Сдать модуль'}
            </button>
          </div>
        </main>
      )}

      <footer className="tp-bottom">
        <div className="tp-bottom-left solve-muted">Отвечено {answered}/{n}</div>
        <div className="tp-navwrap">
          <button className="tp-navbtn" onClick={() => setNavOpen((o) => !o)} aria-expanded={navOpen}>
            {q ? `Вопрос ${cur + 1} из ${n}` : 'Проверка ответов'} <ChevronDown size={15} aria-hidden />
          </button>
          {navOpen && (
            <div className="tp-navpop" role="dialog" aria-label="Вопросы модуля">
              <div className="tp-navpop-head">
                <strong>{module.title || `Модуль ${moduleIndex + 1}`}</strong>
                <span className="tp-legend">
                  <span className="tp-lg tp-lg-cur" /> текущий <span className="tp-lg tp-lg-empty" /> без ответа{' '}
                  <Flag size={12} aria-hidden /> проверить
                </span>
              </div>
              <NavGrid p={p} current={cur} onGo={goTo} />
              <button className="sbtn tp-navpop-review" onClick={() => goTo(n)}>
                Перейти к проверке ответов
              </button>
            </div>
          )}
        </div>
        <div className="tp-bottom-right">
          <button className="sbtn" onClick={() => goTo(cur - 1)} disabled={cur === 0}>
            <ChevronLeft size={16} aria-hidden /> Назад
          </button>
          {q && (
            <button className="sbtn sbtn-primary" onClick={() => goTo(cur + 1)}>
              Далее <ChevronRight size={16} aria-hidden />
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}

function NavGrid({ p, current, onGo }: { p: ModuleProgress; current: number; onGo: (i: number) => void }) {
  return (
    <div className="tp-grid">
      {p.answers.map((a, i) => (
        <button
          key={i}
          className={`tp-cell ${a ? 'is-done' : ''} ${i === current ? 'is-current' : ''}`}
          onClick={() => onGo(i)}
          title={`${i + 1}: ${a ? `ответ ${a}` : 'без ответа'}${p.marked[i] ? ', проверить позже' : ''}`}
        >
          {i + 1}
          {p.marked[i] && <Flag className="tp-cell-flag" size={11} aria-hidden fill="currentColor" />}
        </button>
      ))}
    </div>
  )
}

// --- Результат ---------------------------------------------------------------------------------------

function TestResults({
  token,
  data,
  modules,
  result,
}: {
  token: string
  data: StudentAssignment
  modules: TestModule[]
  result: TestSubmitResult
}) {
  const results: QuestionResult[] = result.results ?? []
  const ranges = moduleRanges(modules)
  const correct = result.correct_count ?? results.filter((r) => r.is_correct).length
  const total = result.total_count ?? results.length
  const score = result.score_estimate ?? estimateRwScore(correct, total)
  const firstWrong = results.findIndex((r) => !r.is_correct)
  const [current, setCurrent] = useState(firstWrong === -1 ? 0 : firstWrong)
  const r = results[current]
  const q = data.questions[current]
  const explanation = result.explanations?.[current] ?? ''
  const moduleOf = (i: number) => ranges.findIndex((x) => i >= x.start && i < x.end)

  return (
    <div className="player tp-results">
      <div className="solve-card results-card">
        <PortalBack />
        <p className="solve-muted">{data.title}</p>
        <div className="tp-score-label">Оценка балла Reading and Writing</div>
        <div className="results-score">≈ {score ?? '—'}</div>
        <p className="tp-score-note">
          Это приблизительная оценка по доле верных ответов, а не официальный балл SAT: настоящая шкала зависит от
          сложности вопросов и модуля.
        </p>
        <div className="tp-modsum">
          {modules.map((m, i) => {
            const part = results.slice(ranges[i].start, ranges[i].end)
            const ok = part.filter((x) => x.is_correct).length
            return (
              <div key={i} className="tp-modsum-item">
                <span>{m.title || `Модуль ${i + 1}`}</span>
                <strong>
                  {ok} <small>/ {part.length}</small>
                </strong>
              </div>
            )
          })}
          <div className="tp-modsum-item">
            <span>Всего</span>
            <strong>
              {correct} <small>/ {total}</small>
            </strong>
          </div>
        </div>
        <p className="solve-muted">
          Время на вопросы: {formatDuration(result.duration_sec)} · результаты отправлены преподавателю
        </p>
      </div>

      <h2 className="results-h">Разбор</h2>
      {modules.map((m, mi) => (
        <div key={mi} className="tp-rev-module">
          <div className="tp-rev-title">{m.title || `Модуль ${mi + 1}`}</div>
          <div className="palette">
            {results.slice(ranges[mi].start, ranges[mi].end).map((x, k) => {
              const i = ranges[mi].start + k
              return (
                <button
                  key={x.n}
                  className={`pcell ${x.is_correct ? 'pcell-ok' : 'pcell-bad'} ${i === current ? 'pcell-current' : ''}`}
                  onClick={() => setCurrent(i)}
                  title={x.is_correct ? 'Верно' : `Твой ответ: ${x.answer ?? '—'}, верно: ${x.correct}`}
                >
                  {k + 1}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {q && r && (
        <>
          <div className="player-progress">
            {modules[moduleOf(current)]?.title}, вопрос {current - ranges[Math.max(0, moduleOf(current))].start + 1}:{' '}
            {r.is_correct ? 'верно ✓' : r.answer ? `твой ответ ${r.answer}, верно ${r.correct}` : `нет ответа, верно ${r.correct}`}{' '}
            · {formatDuration(r.time_sec)}
          </div>
          <WordLookup token={token}>
            <div className="paper player-paper">
              <QuestionView
                q={q}
                number={current - ranges[Math.max(0, moduleOf(current))].start + 1}
                selected={r.answer}
                correct={r.correct}
              />
              {explanation && (
                <div className="tp-explain">
                  <div className="tp-explain-h">Объяснение</div>
                  <Html html={explanation} />
                </div>
              )}
            </div>
          </WordLookup>
          <div className="player-nav">
            <button className="sbtn" onClick={() => setCurrent((c) => Math.max(0, c - 1))} disabled={current === 0}>
              ← Назад
            </button>
            <button
              className="sbtn"
              onClick={() => setCurrent((c) => Math.min(results.length - 1, c + 1))}
              disabled={current === results.length - 1}
            >
              Далее →
            </button>
          </div>
        </>
      )}
    </div>
  )
}
