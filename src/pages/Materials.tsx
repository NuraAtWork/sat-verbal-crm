import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { plural } from '../dates'
import { newId } from '../db'
import { ACTIVE_MATERIAL_KINDS, DOMAINS, MATERIAL_KIND_LABELS, SKILLS, safeUrl } from '../sat'
import type { Material, MaterialKind } from '../types'
import { useStore } from '../useStore'

/** Что сейчас открыто в форме: новый материал (с предвыбранным типом/навыком) или редактирование. */
type Editing = { id?: string; kind: MaterialKind; skill?: string } | null

const byTitle = (a: Material, b: Material) => a.title.localeCompare(b.title, 'ru', { numeric: true })

const domainName = (id: string) => DOMAINS.find((d) => d.id === id)?.name ?? ''

interface Folder {
  id: string
  title: string
  /** Тип, с которым создаются новые материалы в папке; null — папка только для старых типов */
  addKind: MaterialKind | null
  match: (m: Material) => boolean
  summary: (items: Material[]) => string
}

const FOLDERS: Folder[] = [
  {
    id: 'questions',
    title: MATERIAL_KIND_LABELS.practice,
    addKind: 'practice',
    match: (m) => m.kind === 'practice',
    summary: (items) => {
      const covered = SKILLS.filter((s) => items.some((m) => m.skills.includes(s.id))).length
      return `${items.length} ${plural(items.length, 'сет', 'сета', 'сетов')} · ${covered} из ${SKILLS.length} категорий`
    },
  },
  {
    id: 'tests',
    title: MATERIAL_KIND_LABELS.test,
    addKind: 'test',
    match: (m) => m.kind === 'test',
    summary: (items) => `${items.length} ${plural(items.length, 'тест', 'теста', 'тестов')}`,
  },
  {
    id: 'other',
    title: 'Другие материалы',
    addKind: null,
    match: (m) => !ACTIVE_MATERIAL_KINDS.includes(m.kind),
    summary: (items) => `${items.length} ${plural(items.length, 'материал', 'материала', 'материалов')}`,
  },
]

/** Список папок. «Другие материалы» показываем, только если там что-то есть. */
export function Materials() {
  const { db } = useStore()
  const folders = FOLDERS.map((f) => ({ ...f, items: db.materials.filter(f.match) })).filter(
    (f) => f.addKind !== null || f.items.length > 0,
  )

  return (
    <div className="page">
      <h1>Материалы</h1>
      <div className="folders">
        {folders.map((f) => (
          <Link key={f.id} to={`/materials/${f.id}`} className={`folder folder-${f.id}`}>
            <FolderIcon />
            <span className="folder-text">
              <span className="folder-name">{f.title}</span>
              <span className="muted small">{f.summary(f.items)}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

function FolderIcon() {
  return (
    <svg className="folder-icon" viewBox="0 0 48 40" aria-hidden="true">
      <path d="M4 6a4 4 0 0 1 4-4h11l5 5h16a4 4 0 0 1 4 4v3H4z" className="folder-back" />
      <rect x="2" y="12" width="44" height="26" rx="4" className="folder-front" />
    </svg>
  )
}

/** Содержимое папки: карточки категорий или карточки тестов. */
export function MaterialFolder() {
  const { folder: folderId } = useParams()
  const { db, dispatch } = useStore()
  const [editing, setEditing] = useState<Editing>(null)

  const folder = FOLDERS.find((f) => f.id === folderId)
  if (!folder) return <Navigate to="/materials" replace />

  const items = db.materials.filter(folder.match).sort(byTitle)
  const editingMaterial = editing?.id ? db.materials.find((m) => m.id === editing.id) : undefined

  const onEdit = (m: Material) => setEditing({ id: m.id, kind: m.kind })
  const onRemove = (m: Material) => {
    if (!confirm(`Удалить «${m.title}»?`)) return
    dispatch({ type: 'material/delete', id: m.id })
    if (editing?.id === m.id) setEditing(null)
  }
  const addKind = folder.addKind

  return (
    <div className="page">
      <nav className="breadcrumbs">
        <Link to="/materials">Материалы</Link>
        <span>/</span>
      </nav>
      <div className="page-head">
        <h1>
          {folder.title} <span className="muted h1-count">{items.length}</span>
        </h1>
        {addKind && !editing && (
          <button className="btn btn-primary" onClick={() => setEditing({ kind: addKind })}>
            + Добавить
          </button>
        )}
      </div>

      {editing && (
        <MaterialForm
          key={editing.id ?? `${editing.kind}:${editing.skill ?? ''}`}
          initial={editingMaterial}
          defaults={editing}
          onDone={() => setEditing(null)}
        />
      )}

      {folder.id === 'questions' ? (
        <div className="card-grid">
          {SKILLS.map((s) => (
            <CategoryCard
              key={s.id}
              domainId={s.domainId}
              title={s.name}
              items={items.filter((m) => m.skills.includes(s.id))}
              onAdd={() => setEditing({ kind: 'practice', skill: s.id })}
              onEdit={onEdit}
              onRemove={onRemove}
            />
          ))}
          {items.some((m) => m.skills.length === 0) && (
            <CategoryCard
              title="Без категории"
              items={items.filter((m) => m.skills.length === 0)}
              onEdit={onEdit}
              onRemove={onRemove}
            />
          )}
        </div>
      ) : items.length === 0 ? (
        <p className="muted folder-empty">
          Папка пуста. Добавьте прошлые экзамены и пробные тесты — ссылкой на файл или страницу.
        </p>
      ) : (
        <div className="card-grid">
          {items.map((m) => (
            <TestCard key={m.id} m={m} onEdit={onEdit} onRemove={onRemove} />
          ))}
        </div>
      )}
    </div>
  )
}

function MaterialLink({ m }: { m: Material }) {
  const { sync } = useStore()
  if (m.setId && sync.mode === 'cloud') {
    return (
      <Link to={`/sets/${m.setId}`} title={m.notes || undefined}>
        {m.title}
      </Link>
    )
  }
  const href = safeUrl(m.url)
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" title={m.notes || undefined}>
      {m.title} ↗
    </a>
  ) : (
    <span title={m.notes || undefined}>{m.title}</span>
  )
}

function ItemActions({ m, onEdit, onRemove }: { m: Material; onEdit: (m: Material) => void; onRemove: (m: Material) => void }) {
  return (
    <span className="item-actions">
      <button className="icon-btn icon-edit" title="Изменить" onClick={() => onEdit(m)}>
        ✎
      </button>
      <button className="icon-btn" title="Удалить" onClick={() => onRemove(m)}>
        ✕
      </button>
    </span>
  )
}

function CategoryCard(props: {
  domainId?: string
  title: string
  items: Material[]
  onAdd?: () => void
  onEdit: (m: Material) => void
  onRemove: (m: Material) => void
}) {
  return (
    <div className={`mcard cat cat-${props.domainId ?? 'none'}`}>
      {props.domainId && <div className="cat-domain">{domainName(props.domainId)}</div>}
      <div className="cat-title">
        {props.title} {props.items.length > 0 && <span className="muted">{props.items.length}</span>}
      </div>
      {props.items.length === 0 ? (
        <p className="muted small cat-empty">Пока пусто</p>
      ) : (
        <ul className="cat-items">
          {props.items.map((m) => (
            <li key={m.id}>
              <MaterialLink m={m} />
              <ItemActions m={m} onEdit={props.onEdit} onRemove={props.onRemove} />
            </li>
          ))}
        </ul>
      )}
      {props.onAdd && (
        <button className="link-btn cat-add" onClick={props.onAdd}>
          + Добавить
        </button>
      )}
    </div>
  )
}

function TestCard({ m, onEdit, onRemove }: { m: Material; onEdit: (m: Material) => void; onRemove: (m: Material) => void }) {
  const href = safeUrl(m.url)
  return (
    <div className="mcard test-card">
      <div className="test-title">{m.title}</div>
      {m.notes && <div className="muted small test-notes">{m.notes}</div>}
      <div className="test-actions">
        {href ? (
          <a className="btn btn-small" href={href} target="_blank" rel="noopener noreferrer">
            Открыть ↗
          </a>
        ) : (
          <span className="muted small">без ссылки</span>
        )}
        <ItemActions m={m} onEdit={onEdit} onRemove={onRemove} />
      </div>
    </div>
  )
}

function MaterialForm({
  initial,
  defaults,
  onDone,
}: {
  initial?: Material
  defaults: { kind: MaterialKind; skill?: string }
  onDone: () => void
}) {
  const { dispatch } = useStore()
  const [title, setTitle] = useState(initial?.title ?? '')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [kind, setKind] = useState<MaterialKind>(initial?.kind ?? defaults.kind)
  const [skills, setSkills] = useState<string[]>(initial?.skills ?? (defaults.skill ? [defaults.skill] : []))
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const ref = useRef<HTMLFormElement>(null)

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [])

  const urlInvalid = url.trim() !== '' && safeUrl(url) === null
  const kindOptions = ACTIVE_MATERIAL_KINDS.includes(kind) ? ACTIVE_MATERIAL_KINDS : [...ACTIVE_MATERIAL_KINDS, kind]

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
        skills: kind === 'practice' ? skills : [],
        notes: notes.trim(),
      },
    })
    onDone()
  }

  return (
    <form ref={ref} className="card form" onSubmit={onSubmit}>
      <h2>{initial ? 'Изменить материал' : 'Новый материал'}</h2>
      <div className="field-row">
        <label className="field grow-2">
          <span>Название *</span>
          <input
            className="input"
            placeholder={kind === 'test' ? 'Напр. «SAT март 2025» или «Bluebook PT 6»' : 'Напр. «Boundaries — сет 1»'}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label className="field">
          <span>Раздел</span>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as MaterialKind)}>
            {kindOptions.map((k) => (
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

      {kind === 'practice' && (
        <div className="field">
          <span>Категории</span>
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
      )}

      <label className="field">
        <span>Заметки</span>
        <textarea
          className="input"
          rows={2}
          placeholder={kind === 'test' ? 'Дата, регион, где лежат ответы…' : 'Сколько вопросов, уровень сложности…'}
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
