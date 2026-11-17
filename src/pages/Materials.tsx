import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ChevronRight,
  ClipboardList,
  ExternalLink,
  Eye,
  FileText,
  FileQuestion,
  FolderOpen,
  Pencil,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { plural } from '../dates'
import { newId } from '../db'
import { ACTIVE_MATERIAL_KINDS, DOMAINS, MATERIAL_KIND_LABELS, SKILLS, safeUrl } from '../sat'
import type { Material, MaterialKind } from '../types'
import { useStore } from '../useStore'

/** Что сейчас открыто в форме: новый материал (с предвыбранным типом/навыком) или редактирование. */
type Editing = { id?: string; kind: MaterialKind; skill?: string } | null

const byTitle = (a: Material, b: Material) => a.title.localeCompare(b.title, 'ru', { numeric: true })

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
            <FolderIcon id={f.id} />
            <span className="folder-text">
              <span className="folder-name">{f.title}</span>
              <span className="muted small">{f.summary(f.items)}</span>
            </span>
            <ChevronRight size={18} className="folder-chevron" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </div>
  )
}

function FolderIcon({ id }: { id: string }) {
  const Icon = id === 'questions' ? FileQuestion : id === 'tests' ? ClipboardList : FolderOpen
  return (
    <span className="folder-icon" aria-hidden="true">
      <Icon size={20} />
    </span>
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
            <Plus size={16} aria-hidden="true" /> Добавить
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
        <>
          <div className="qlegend muted small">
            Номер — это сет, полоска снизу — преобладающая сложность:
            <span className="lvl-dot lvl-easy" /> Easy
            <span className="lvl-dot lvl-medium" /> Medium
            <span className="lvl-dot lvl-hard" /> Hard
          </div>
          <QuestionRows
            items={items}
            onAdd={(skill) => setEditing({ kind: 'practice', skill })}
            onEdit={onEdit}
            onRemove={onRemove}
          />
        </>
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

function ItemActions({ m, onEdit, onRemove }: { m: Material; onEdit: (m: Material) => void; onRemove: (m: Material) => void }) {
  return (
    <span className="item-actions">
      <button className="icon-btn icon-edit" title="Изменить" onClick={() => onEdit(m)}>
        <Pencil size={14} aria-hidden="true" />
      </button>
      <button className="icon-btn" title="Удалить" onClick={() => onRemove(m)}>
        <X size={15} aria-hidden="true" />
      </button>
    </span>
  )
}

interface Difficulty {
  counts: Record<'Easy' | 'Medium' | 'Hard', number>
  total: number
  /** Преобладающая сложность для цветной полоски */
  main: 'easy' | 'medium' | 'hard' | 'none'
}

/** Разбирает «25 вопросов · 15 Easy, 10 Medium» из заметок сета. */
function difficultyOf(notes: string): Difficulty {
  const counts = { Easy: 0, Medium: 0, Hard: 0 }
  for (const m of notes.matchAll(/(\d+)\s+(Easy|Medium|Hard)/g)) {
    counts[m[2] as keyof typeof counts] += Number(m[1])
  }
  const total = counts.Easy + counts.Medium + counts.Hard
  const order = ['Hard', 'Medium', 'Easy'] as const
  const top = total ? order.reduce((best, k) => (counts[k] > counts[best] ? k : best), order[0]) : null
  return { counts, total, main: top ? (top.toLowerCase() as Difficulty['main']) : 'none' }
}

/** «Boundaries — Set 7» → 7; без номера в названии — null. */
function setNumber(title: string): number | null {
  const m = title.match(/(?:set|сет)\s*(\d+)/i)
  return m ? Number(m[1]) : null
}

/** Сначала сеты с номерами по порядку, потом остальные материалы по названию. */
function sortSets(sets: Material[]): Material[] {
  return [...sets].sort((a, b) => {
    const na = setNumber(a.title) ?? Infinity
    const nb = setNumber(b.title) ?? Infinity
    return na - nb || a.title.localeCompare(b.title, 'ru', { numeric: true })
  })
}

function DiffBar({ d }: { d: Difficulty }) {
  if (!d.total) return null
  const label = (['Easy', 'Medium', 'Hard'] as const)
    .filter((k) => d.counts[k])
    .map((k) => `${d.counts[k]} ${k}`)
    .join(', ')
  return (
    <span className="diffbar" title={label} aria-label={label}>
      {d.counts.Easy > 0 && <span className="lvl-easy" style={{ flex: d.counts.Easy }} />}
      {d.counts.Medium > 0 && <span className="lvl-medium" style={{ flex: d.counts.Medium }} />}
      {d.counts.Hard > 0 && <span className="lvl-hard" style={{ flex: d.counts.Hard }} />}
    </span>
  )
}

type Selected = { row: string; id: string } | null

/** Компактные строки: категория → номера сетов; клик по номеру раскрывает детали под строкой. */
function QuestionRows(props: {
  items: Material[]
  onAdd: (skill: string) => void
  onEdit: (m: Material) => void
  onRemove: (m: Material) => void
}) {
  const [selected, setSelected] = useState<Selected>(null)
  const uncategorized = sortSets(props.items.filter((m) => m.skills.length === 0))

  const row = (key: string, name: string, sets: Material[], onAdd?: () => void) => (
    <QuestionRow
      key={key}
      rowKey={key}
      name={name}
      sets={sets}
      selected={selected}
      onSelect={setSelected}
      onAdd={onAdd}
      onEdit={props.onEdit}
      onRemove={(m) => {
        props.onRemove(m)
        setSelected(null)
      }}
    />
  )

  return (
    <div className="card qrows">
      {DOMAINS.map((d) => (
        <section key={d.id} className={`qgroup qgroup-${d.id}`}>
          <div className="qdomain">{d.name}</div>
          {d.skills.map((s) =>
            row(
              s.id,
              s.name,
              sortSets(props.items.filter((m) => m.skills.includes(s.id))),
              () => props.onAdd(s.id),
            ),
          )}
        </section>
      ))}
      {uncategorized.length > 0 && (
        <section className="qgroup">
          <div className="qdomain">Без категории</div>
          {row('none', 'Без категории', uncategorized)}
        </section>
      )}
    </div>
  )
}

function QuestionRow(props: {
  rowKey: string
  name: string
  sets: Material[]
  selected: Selected
  onSelect: (s: Selected) => void
  onAdd?: () => void
  onEdit: (m: Material) => void
  onRemove: (m: Material) => void
}) {
  const current =
    props.selected?.row === props.rowKey ? props.sets.find((m) => m.id === props.selected?.id) : undefined
  return (
    <div className={`qrow-wrap ${current ? 'is-open' : ''}`}>
      <div className="qrow">
        <div className="qrow-name">{props.name}</div>
        <div className="qrow-sets">
          {props.sets.map((m) => {
            const d = difficultyOf(m.notes)
            const num = setNumber(m.title)
            const isSel = current?.id === m.id
            return (
              <button
                key={m.id}
                className={`set-pill lvl-${d.main} ${isSel ? 'is-sel' : ''}`}
                title={`${m.title}${m.notes ? ` · ${m.notes}` : ''}`}
                aria-pressed={isSel}
                onClick={() => props.onSelect(isSel ? null : { row: props.rowKey, id: m.id })}
              >
                {num ?? <FileText size={14} aria-label={m.title} />}
              </button>
            )
          })}
          {props.onAdd && (
            <button className="set-pill set-add" title="Добавить сет в эту категорию" onClick={props.onAdd}>
              <Plus size={14} aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="qrow-count">
          {props.sets.length ? `${props.sets.length} ${plural(props.sets.length, 'сет', 'сета', 'сетов')}` : '—'}
        </div>
      </div>
      {current && (
        <SetDetails m={current} onClose={() => props.onSelect(null)} onEdit={props.onEdit} onRemove={props.onRemove} />
      )}
    </div>
  )
}

function SetDetails(props: {
  m: Material
  onClose: () => void
  onEdit: (m: Material) => void
  onRemove: (m: Material) => void
}) {
  const { sync } = useStore()
  const { m } = props
  const cloudSet = Boolean(m.setId) && sync.mode === 'cloud'
  const href = safeUrl(m.url)
  return (
    <div className="qdetail">
      <div className="qdetail-info">
        <div className="qdetail-title">{m.title}</div>
        <div className="qdetail-meta">
          <DiffBar d={difficultyOf(m.notes)} />
          {m.notes && <span className="muted small">{m.notes}</span>}
        </div>
      </div>
      <div className="qdetail-actions">
        {cloudSet ? (
          <>
            <Link className="btn btn-small" to={`/sets/${m.setId}`}>
              <Eye size={14} aria-hidden="true" /> Открыть
            </Link>
            <Link className="btn btn-small btn-primary" to={`/sets/${m.setId}?assign=1`}>
              <Send size={14} aria-hidden="true" /> Задать
            </Link>
          </>
        ) : (
          href && (
            <a className="btn btn-small" href={href} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={14} aria-hidden="true" /> Открыть
            </a>
          )
        )}
        <button className="icon-btn icon-edit" title="Изменить" onClick={() => props.onEdit(m)}>
          <Pencil size={14} aria-hidden="true" />
        </button>
        <button className="icon-btn" title="Удалить" onClick={() => props.onRemove(m)}>
          <Trash2 size={15} aria-hidden="true" />
        </button>
        <button className="icon-btn icon-edit" title="Свернуть" onClick={props.onClose}>
          <X size={15} aria-hidden="true" />
        </button>
      </div>
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
