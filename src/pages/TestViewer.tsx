import { useMemo, type MouseEvent } from 'react'
import { QuestionView } from '../components/QuestionView'
import { plural } from '../dates'
import { sanitizeHtml } from '../html'
import { SKILLS, skillName } from '../sat'
import type { QuestionSet, TestModule } from '../types'

// Просмотр пробного теста репетитором: вопросы по модулям, навык каждого вопроса, ключ и объяснения.

function modulesOf(set: QuestionSet): TestModule[] {
  if (set.modules?.length) return set.modules
  return [{ title: 'Модуль 1', count: set.questions.length, minutes: 32 }]
}

/** «54 вопроса · 2 модуля по 32 мин · объяснений: 22 · навык определён у 52» */
export function TestMeta({ set }: { set: QuestionSet }) {
  return <p className="muted set-meta">{testMeta(set)}</p>
}

function testMeta(set: QuestionSet): string {
  const mods = modulesOf(set)
  const n = set.questions.length
  const minutes = [...new Set(mods.map((m) => m.minutes))]
  const expl = (set.explanations ?? []).filter((e) => e && e.trim()).length
  const withSkill = set.questions.filter((q) => q.skill).length
  return [
    `${n} ${plural(n, 'вопрос', 'вопроса', 'вопросов')}`,
    `${mods.length} ${plural(mods.length, 'модуль', 'модуля', 'модулей')}` +
      (minutes.length === 1 ? ` по ${minutes[0]} мин` : ''),
    expl ? `объяснений: ${expl}` : 'без объяснений',
    withSkill === n ? 'навык у всех вопросов' : `навык определён у ${withSkill} из ${n}`,
  ].join(' · ')
}

function Explanation({ html }: { html: string }) {
  const clean = useMemo(() => sanitizeHtml(html), [html])
  if (!clean) return null
  return (
    <div className="tv-explain">
      <div className="tv-explain-h">Объяснение</div>
      <div dangerouslySetInnerHTML={{ __html: clean }} />
    </div>
  )
}

export function TestQuestions({ set, showAnswers }: { set: QuestionSet; showAnswers: boolean }) {
  const mods = modulesOf(set)
  const ranges = mods.map((_, mi) => {
    const start = mods.slice(0, mi).reduce((a, m) => a + m.count, 0)
    return { start, end: start + mods[mi].count }
  })
  const total = mods.reduce((a, m) => a + m.count, 0)
  const mismatch = total !== set.questions.length

  // сколько вопросов каждого навыка — по всему тесту
  const bySkill = SKILLS.map((s) => ({ ...s, count: set.questions.filter((q) => q.skill === s.id).length })).filter(
    (s) => s.count > 0,
  )
  const noSkill = set.questions.filter((q) => !q.skill).length

  return (
    <>
      {bySkill.length > 0 && (
        <div className="tv-skills">
          {bySkill.map((s) => (
            <span key={s.id} className="chip">
              {s.name} <strong>{s.count}</strong>
            </span>
          ))}
          {noSkill > 0 && (
            <span className="chip chip-off">
              без навыка <strong>{noSkill}</strong>
            </span>
          )}
        </div>
      )}

      {mismatch && (
        <p className="error-text small">
          Число вопросов ({set.questions.length}) не совпадает с разбивкой на модули ({total}) — ученикам тест
          проверится неверно. Скорее всего, в редакторе добавили или удалили вопрос.
        </p>
      )}

      <nav className="tv-jump">
        {mods.map((m, mi) => (
          <a key={mi} href={`#module-${mi + 1}`} onClick={(e) => jump(e, mi + 1)}>
            {m.title || `Модуль ${mi + 1}`}
          </a>
        ))}
      </nav>

      {mods.map((m, mi) => (
        <section key={mi} id={`tv-module-${mi + 1}`} className="tv-module">
          <h2 className="tv-module-h">
            {m.title || `Модуль ${mi + 1}`}
            <span className="muted">
              {m.count} {plural(m.count, 'вопрос', 'вопроса', 'вопросов')} · {m.minutes} мин
            </span>
          </h2>
          <div className="paper">
            {set.questions.slice(ranges[mi].start, ranges[mi].end).map((q, k) => {
              const i = ranges[mi].start + k
              const expl = set.explanations?.[i] ?? ''
              return (
                <div key={q.n} className="setq tv-q">
                  <div className="tv-q-skill">
                    {q.skill ? skillName(q.skill) : <span className="tv-q-noskill">навык не определён</span>}
                  </div>
                  <QuestionView q={q} number={k + 1} correct={showAnswers ? set.answers[i] : undefined} />
                  {showAnswers && expl && <Explanation html={expl} />}
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </>
  )
}

// HashRouter: обычный якорь сменил бы маршрут, поэтому прокручиваем сами.
function jump(e: MouseEvent, module: number) {
  e.preventDefault()
  document.getElementById(`tv-module-${module}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
