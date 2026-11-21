import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { sanitizeHtml } from '../html'
import { DOMAINS, SKILLS } from '../sat'
import { difficultyOf, setNumber, sortSets } from '../materials'
import { useStore } from '../useStore'

/** Какой тренер помогает с навыком и где его включить. */
const TRAINERS: Record<string, { name: string; where: string }> = {
  boundaries: { name: 'Тренер грамматики', where: 'блок «Грамматика» в карточке ученика' },
  'words-in-context': { name: 'Тренер словаря', where: 'блок «Словарь» в карточке ученика' },
}

interface Section {
  id: string
  title: string
}

/** Санитизирует HTML методички и проставляет якоря разделам (h2) для оглавления. */
function prepare(body: string): { html: string; sections: Section[] } {
  const doc = new DOMParser().parseFromString(sanitizeHtml(body), 'text/html')
  const sections: Section[] = []
  doc.body.querySelectorAll('h2').forEach((h, i) => {
    const id = `guide-s${i + 1}`
    h.id = id
    sections.push({ id, title: h.textContent?.trim() ?? '' })
  })
  return { html: doc.body.innerHTML, sections }
}

/** Методичка по навыку: текст, оглавление и что дать ученику (сеты и тренер). */
export function GuideView() {
  const { id } = useParams()
  const { db, sync } = useStore()
  const guide = db.materials.find((m) => m.id === id && m.kind === 'guide')
  const prepared = useMemo(() => prepare(guide?.body ?? ''), [guide?.body])

  if (!guide) {
    return (
      <div className="page">
        <nav className="breadcrumbs">
          <Link to="/materials">Материалы</Link>
          <span>/</span>
          <Link to="/materials/guides">Методички</Link>
          <span>/</span>
        </nav>
        <p className="muted">Методичка не найдена — возможно, она ещё не загружена.</p>
      </div>
    )
  }

  const skill = SKILLS.find((s) => guide.skills.includes(s.id))
  const domain = DOMAINS.find((d) => d.id === skill?.domainId)
  const sets = skill ? sortSets(db.materials.filter((m) => m.kind === 'practice' && m.skills.includes(skill.id))) : []
  const cloud = sync.mode === 'cloud'
  const trainer = skill ? TRAINERS[skill.id] : undefined

  const scrollTo = (sectionId: string) =>
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="page guide-page">
      <nav className="breadcrumbs">
        <Link to="/materials">Материалы</Link>
        <span>/</span>
        <Link to="/materials/guides">Методички</Link>
        <span>/</span>
      </nav>
      <h1>{guide.title}</h1>
      {(domain || guide.notes) && (
        <p className="muted guide-lead">
          {domain && <span className={`guide-domain guide-domain-${domain.id}`}>{domain.name}</span>}
          {guide.notes}
        </p>
      )}

      <div className="guide-layout">
        <article className="card guide-body" dangerouslySetInnerHTML={{ __html: prepared.html }} />

        <aside className="guide-aside">
          {prepared.sections.length > 1 && (
            <section className="card guide-toc">
              <h2>Содержание</h2>
              <ol>
                {prepared.sections.map((s) => (
                  <li key={s.id}>
                    <button type="button" className="link-btn" onClick={() => scrollTo(s.id)}>
                      {s.title}
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {skill && (
            <section className="card guide-give">
              <h2>Что дать ученику</h2>
              <div className="muted small">Сеты по навыку {skill.name}</div>
              {sets.length === 0 ? (
                <p className="muted small">Сетов пока нет.</p>
              ) : (
                <div className="qrow-sets">
                  {sets.map((m) => {
                    const label = setNumber(m.title) ?? m.title
                    const cls = `set-pill lvl-${difficultyOf(m.notes).main}`
                    const title = `${m.title}${m.notes ? ` · ${m.notes}` : ''}`
                    return cloud && m.setId ? (
                      <Link key={m.id} className={cls} title={title} to={`/sets/${m.setId}`}>
                        {label}
                      </Link>
                    ) : (
                      <span key={m.id} className={cls} title={title}>
                        {label}
                      </span>
                    )
                  })}
                </div>
              )}
              {trainer && (
                <p className="small guide-trainer">
                  <strong>{trainer.name}</strong> — включается в {trainer.where}.
                </p>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}
