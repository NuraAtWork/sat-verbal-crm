import { useState, type FormEvent } from 'react'
import { newId } from '../db'
import { DOMAINS, MATERIAL_KINDS, MATERIAL_KIND_LABELS, safeUrl, skillName } from '../sat'
import type { Material, MaterialKind } from '../types'
import { useStore } from '../useStore'

export function Materials() {
  const { db, dispatch } = useStore()
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<MaterialKind | 'all'>('all')
  const [skill, setSkill] = useState('')
  // null — форма закрыта; 'new' — новый материал; иначе id редактируемого
  const [editing, setEditing] = useState<string | null>(null)

  const q = query.trim().toLowerCase()
  const rows = db.materials
    .filter((m) => kind === 'all' || m.kind === kind)
    .filter((m) => !skill || m.skills.includes(skill))
    .filter((m) => !q || m.title.toLowerCase().includes(q) || m.notes.toLowerCase().includes(q))
    .sort((a, b) => a.title.localeCompare(b.title, 'ru'))

  const editingMaterial = editing && editing !== 'new' ? db.materials.find((m) => m.id === editing) : undefined

  const onDelete = (m: Material) => {
    if (!confirm(`Удалить материал «${m.title}»?`)) return
    dispatch({ type: 'material/delete', id: m.id })
    if (editing === m.id) setEditing(null)
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Материалы</h1>
        {editing === null && (
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            + Материал
          </button>
        )}
      </div>

      {editing !== null && (
        <MaterialForm
          key={editing}
          initial={editingMaterial}
          onDone={() => setEditing(null)}
        />
      )}

      <div className="toolbar">
        <input
          className="input search"
          type="search"
          placeholder="Поиск по названию или заметкам"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="input skill-select" value={skill} onChange={(e) => setSkill(e.target.value)}>
          <option value="">Все навыки</option>
          {DOMAINS.map((d) => (
            <optgroup key={d.id} label={d.name}>
              {d.skills.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <div className="chips">
          <button className={`chip ${kind === 'all' ? 'chip-on' : ''}`} onClick={() => setKind('all')}>
            Все
          </button>
          {MATERIAL_KINDS.map((k) => (
            <button key={k} className={`chip ${kind === k ? 'chip-on' : ''}`} onClick={() => setKind(k)}>
              {MATERIAL_KIND_LABELS[k]}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card empty">
          <p className="muted">
            {db.materials.length === 0
              ? 'Здесь будет ваша библиотека: пробные тесты, сеты вопросов, словари, теория, видео. Добавьте ссылку на файл в Google Drive или страницу сайта.'
              : 'Ничего не нашлось по этому фильтру.'}
          </p>
        </div>
      ) : (
        <ul className="materials">
          {rows.map((m) => {
            const href = safeUrl(m.url)
            return (
              <li key={m.id} className="card material">
                <div className="material-head">
                  <span className={`badge badge-kind badge-kind-${m.kind}`}>{MATERIAL_KIND_LABELS[m.kind]}</span>
                  {href ? (
                    <a className="material-title" href={href} target="_blank" rel="noopener noreferrer">
                      {m.title} ↗
                    </a>
                  ) : (
                    <span className="material-title">{m.title}</span>
                  )}
                  <div className="push-right row">
                    <button className="link-btn" onClick={() => setEditing(m.id)}>
                      Изменить
                    </button>
                    <button className="icon-btn" title="Удалить" onClick={() => onDelete(m)}>
                      ✕
                    </button>
                  </div>
                </div>
                {m.skills.length > 0 && (
                  <div className="chips">
                    {m.skills.map((s) => (
                      <button
                        key={s}
                        className={`chip small ${skill === s ? 'chip-on' : ''}`}
                        title="Показать материалы по этому навыку"
                        onClick={() => setSkill(s)}
                      >
                        {skillName(s)}
                      </button>
                    ))}
                  </div>
                )}
                {m.notes && <div className="muted">{m.notes}</div>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function MaterialForm({ initial, onDone }: { initial?: Material; onDone: () => void }) {
  const { dispatch } = useStore()
  const [title, setTitle] = useState(initial?.title ?? '')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [kind, setKind] = useState<MaterialKind>(initial?.kind ?? 'practice')
  const [skills, setSkills] = useState<string[]>(initial?.skills ?? [])
  const [notes, setNotes] = useState(initial?.notes ?? '')

  const urlInvalid = url.trim() !== '' && safeUrl(url) === null

  const toggle = (id: string) =>
    setSkills((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim() || urlInvalid) return
    dispatch({
      type: 'material/upsert',
      material: {
        id: initial?.id ?? newId(),
        createdAt: initial?.createdAt ?? new Date().toISOString(),
        title: title.trim(),
        url: url.trim() ? (safeUrl(url) ?? '') : '',
        kind,
        skills,
        notes: notes.trim(),
      },
    })
    onDone()
  }

  return (
    <form className="card form" onSubmit={onSubmit}>
      <h2>{initial ? 'Изменить материал' : 'Новый материал'}</h2>
      <div className="field-row">
        <label className="field grow-2">
          <span>Название *</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
        </label>
        <label className="field">
          <span>Тип</span>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as MaterialKind)}>
            {MATERIAL_KINDS.map((k) => (
              <option key={k} value={k}>
                {MATERIAL_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field">
        <span>Ссылка</span>
        <input
          className="input"
          placeholder="https://drive.google.com/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        {urlInvalid && <span className="error-text">Нужна ссылка вида https://…</span>}
      </label>

      <div className="field">
        <span>Навыки</span>
        <div className="coverage">
          {DOMAINS.map((d) => (
            <div key={d.id} className="coverage-domain">
              <div className="coverage-title">{d.name}</div>
              <div className="chips">
                {d.skills.map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    className={`chip ${skills.includes(s.id) ? 'chip-on' : ''}`}
                    onClick={() => toggle(s.id)}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <label className="field">
        <span>Заметки</span>
        <textarea
          className="input"
          rows={2}
          placeholder="Для какого уровня, сколько вопросов, как использовать…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>

      <div className="row">
        <button className="btn btn-primary" type="submit">
          Сохранить
        </button>
        <button className="btn" type="button" onClick={onDone}>
          Отмена
        </button>
      </div>
    </form>
  )
}
