import { Plus, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { newId } from '../db'
import { supabase } from '../supabase'
import { useStore } from '../useStore'
import { BLANK, deleteVocabRequest, parseVocabWord, plural, type VocabWord } from '../vocab'
import {
  deleteVocabWord,
  fulfilVocabRequest,
  listVocabRequests,
  listVocabWords,
  saveVocabWord,
  type VocabRequest,
} from '../vocabAdmin'
import '../vocab/vocab.css'

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const MAX_ROWS = 200

/** Слово в форме: списки — строками через запятую. */
interface Draft {
  id: string | null
  word: string
  pos: string
  connotation: string
  definition: string
  translation: string
  confusables: string
  forms: string
  deck: string
  rank: number
  contexts: { text: string; answer: string; distractors: string; note: string }[]
}

const emptyDraft = (word = ''): Draft => ({
  id: null, word, pos: '', connotation: '', definition: '', translation: '', confusables: '', forms: '', deck: '', rank: 0, contexts: [],
})

const toDraft = (w: VocabWord): Draft => ({
  id: w.id,
  word: w.word,
  pos: w.pos,
  connotation: w.connotation,
  definition: w.definition,
  translation: w.translation,
  confusables: w.confusables.join(', '),
  forms: (w.forms ?? []).filter((f) => f !== w.word.toLowerCase()).join(', '),
  deck: w.deck,
  rank: w.rank ?? 0,
  contexts: w.contexts.map((c) => ({
    text: c.text, answer: c.answer ?? '', distractors: c.distractors.join(', '), note: c.note ?? '',
  })),
})

const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)

/** Страница «Словарь»: слова тренера, их правка и просьбы учеников (только облачный режим). */
export function VocabWords() {
  const { db, sync } = useStore()
  const [words, setWords] = useState<VocabWord[] | null>(null)
  const [requests, setRequests] = useState<VocabRequest[]>([])
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    Promise.all([listVocabWords(supabase), listVocabRequests(supabase)]).then(
      ([w, r]) => {
        if (cancelled) return
        setWords(w)
        setRequests(r)
      },
      (e: unknown) => !cancelled && setError(errText(e)),
    )
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!words) return []
    if (!q) return words
    return words.filter(
      (w) => w.word.toLowerCase().includes(q) || w.translation.toLowerCase().includes(q) || w.definition.toLowerCase().includes(q),
    )
  }, [words, query])

  if (sync.mode !== 'cloud' || !supabase) {
    return (
      <div className="page">
        <h1>Словарь</h1>
        <p className="muted">Словарь тренера слов хранится в облаке — он появится после подключения Supabase.</p>
      </div>
    )
  }
  const sb = supabase
  const studentName = (id: string) => db.students.find((s) => s.id === id)?.name ?? 'ученик'

  const onSaved = async (word: VocabWord) => {
    setWords((prev) => {
      const rest = (prev ?? []).filter((w) => w.id !== word.id)
      return [...rest, word].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0) || a.word.localeCompare(b.word))
    })
    setDraft(null)
    // слово появилось — выполняем просьбы учеников о нём
    const forms = new Set([word.word.toLowerCase(), ...(word.forms ?? [])])
    const matched = requests.filter((r) => forms.has(r.text))
    try {
      for (const r of matched) await fulfilVocabRequest(sb, r, word.id)
      setRequests((prev) => prev.filter((r) => !matched.includes(r)))
    } catch (e) {
      setError(errText(e))
    }
  }

  const onDeleted = (id: string) => {
    setWords((prev) => (prev ?? []).filter((w) => w.id !== id))
    setDraft(null)
  }

  const onDropRequest = async (r: VocabRequest) => {
    try {
      await deleteVocabRequest(sb, r.id)
      setRequests((prev) => prev.filter((x) => x.id !== r.id))
    } catch (e) {
      setError(errText(e))
    }
  }

  const nextRank = Math.max(0, ...(words ?? []).map((w) => w.rank ?? 0)) + 1

  return (
    <div className="page">
      <div className="page-head">
        <h1>Словарь</h1>
        <button className="btn btn-primary" onClick={() => setDraft(emptyDraft())}>
          <Plus size={16} aria-hidden="true" /> Слово
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      {requests.length > 0 && (
        <section className="card">
          <h2>Ученики просили добавить</h2>
          <p className="muted small">
            Эти слова ученики нажали в разборе задания, а в словаре их нет. После добавления слово сразу встанет в
            очередь тренера этого ученика.
          </p>
          <div className="chips">
            {requests.map((r) => (
              <span key={r.id} className="chip">
                <button className="link-btn" onClick={() => setDraft(emptyDraft(r.text))}>
                  {r.text}
                </button>
                <span className="muted small">{studentName(r.studentId)}</span>
                <button className="icon-btn" title="Убрать просьбу" onClick={() => void onDropRequest(r)}>
                  <X size={12} aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        </section>
      )}

      {draft && (
        <WordForm
          key={draft.id ?? `new:${draft.word}`}
          initial={draft}
          nextRank={nextRank}
          onCancel={() => setDraft(null)}
          onSaved={onSaved}
          onDeleted={onDeleted}
        />
      )}

      <section className="card">
        <div className="toolbar">
          <input
            className="input search"
            placeholder="Поиск по слову, переводу, определению"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="muted small">
            {words === null
              ? 'Загрузка…'
              : `${filtered.length} ${plural(filtered.length, 'слово', 'слова', 'слов')}${query.trim() ? ` из ${words.length}` : ''}`}
          </span>
        </div>
        {words !== null && words.length === 0 && (
          <p className="muted">Слов пока нет. Добавьте слово вручную или загрузите файл в «Данные → Добавить из файла».</p>
        )}
        {filtered.length > 0 && (
          <div className="table-wrap">
            <table className="table compact">
              <thead>
                <tr>
                  <th>Слово</th>
                  <th>Определение</th>
                  <th>Перевод</th>
                  <th className="num" title="Предложений с пропуском">
                    Контексты
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, MAX_ROWS).map((w) => (
                  <tr key={w.id}>
                    <td>
                      <button className="link-btn" onClick={() => { setDraft(toDraft(w)); window.scrollTo({ top: 0 }) }}>
                        {w.word}
                      </button>{' '}
                      <span className="muted small">{w.pos}</span>
                    </td>
                    <td>{w.definition}</td>
                    <td className="muted">{w.translation}</td>
                    <td className="num">{w.contexts.length || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filtered.length > MAX_ROWS && (
          <p className="muted small">Показаны первые {MAX_ROWS} — уточните поиск, чтобы найти остальные.</p>
        )}
      </section>
    </div>
  )
}

function WordForm(props: {
  initial: Draft
  nextRank: number
  onCancel: () => void
  onSaved: (w: VocabWord) => void
  onDeleted: (id: string) => void
}) {
  const { initial, nextRank, onCancel, onSaved, onDeleted } = props
  const [d, setD] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }))
  const setContext = (i: number, patch: Partial<Draft['contexts'][number]>) =>
    setD((prev) => ({ ...prev, contexts: prev.contexts.map((c, j) => (j === i ? { ...c, ...patch } : c)) }))

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    const bad = d.contexts.findIndex((c) => !c.text.includes(BLANK) || list(c.distractors).length === 0)
    if (bad !== -1) {
      setError(`Контекст ${bad + 1}: нужен пропуск ${BLANK} в тексте и хотя бы один неверный вариант.`)
      return
    }
    const word = parseVocabWord({
      id: d.id ?? newId(),
      word: d.word,
      pos: d.pos,
      connotation: d.connotation,
      definition: d.definition,
      translation: d.translation,
      confusables: list(d.confusables),
      forms: list(d.forms),
      deck: d.deck,
      rank: d.id ? d.rank : nextRank,
      contexts: d.contexts.map((c) => ({ text: c.text, answer: c.answer, distractors: list(c.distractors), note: c.note })),
    })
    if (!word) {
      setError('Нужны слово и определение.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await saveVocabWord(supabase, word)
      onSaved(word)
    } catch (err) {
      setError(errText(err))
      setBusy(false)
    }
  }

  const onDelete = async () => {
    if (!supabase || !d.id) return
    if (!confirm(`Удалить слово «${d.word}»? Вместе с ним удалится прогресс учеников по этому слову.`)) return
    setBusy(true)
    try {
      await deleteVocabWord(supabase, d.id)
      onDeleted(d.id)
    } catch (err) {
      setError(errText(err))
      setBusy(false)
    }
  }

  return (
    <form className="card lesson-form" onSubmit={onSubmit}>
      <h2>{d.id ? `Слово «${initial.word}»` : 'Новое слово'}</h2>
      <div className="field-row">
        <label className="field">
          <span>Слово (начальная форма)</span>
          <input className="input" value={d.word} onChange={(e) => set({ word: e.target.value })} required autoFocus={!d.id} />
        </label>
        <label className="field">
          <span>Часть речи</span>
          <select className="input" value={d.pos} onChange={(e) => set({ pos: e.target.value })}>
            <option value="">—</option>
            <option value="noun">noun</option>
            <option value="verb">verb</option>
            <option value="adj">adj</option>
            <option value="adv">adv</option>
          </select>
        </label>
        <label className="field">
          <span>Оттенок</span>
          <select className="input" value={d.connotation} onChange={(e) => set({ connotation: e.target.value })}>
            <option value="">—</option>
            <option value="positive">положительный</option>
            <option value="negative">отрицательный</option>
            <option value="neutral">нейтральный</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span>Определение на английском</span>
        <input className="input" value={d.definition} onChange={(e) => set({ definition: e.target.value })} required />
      </label>
      <label className="field">
        <span>Перевод</span>
        <input className="input" value={d.translation} onChange={(e) => set({ translation: e.target.value })} />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Не путать с (через запятую)</span>
          <input className="input" value={d.confusables} onChange={(e) => set({ confusables: e.target.value })} />
        </label>
        <label className="field">
          <span>Другие формы (через запятую)</span>
          <input
            className="input"
            value={d.forms}
            onChange={(e) => set({ forms: e.target.value })}
            placeholder="corroborates, corroboration"
            title="По формам слово узнаётся в вариантах ответа и в тексте вопроса"
          />
        </label>
      </div>

      <div className="field">
        <span>Контексты — предложения с пропуском {BLANK}</span>
        {d.contexts.map((c, i) => (
          <div key={i} className="vw-context">
            <textarea
              className="input"
              rows={3}
              value={c.text}
              onChange={(e) => setContext(i, { text: e.target.value })}
              placeholder={`The new data ${BLANK} the earlier findings.`}
            />
            <div className="field-row">
              <input
                className="input"
                value={c.answer}
                onChange={(e) => setContext(i, { answer: e.target.value })}
                placeholder="Форма для пропуска (если не начальная)"
              />
              <input
                className="input"
                value={c.distractors}
                onChange={(e) => setContext(i, { distractors: e.target.value })}
                placeholder="Неверные варианты через запятую (3)"
              />
            </div>
            <div className="row">
              <input
                className="input grow"
                value={c.note}
                onChange={(e) => setContext(i, { note: e.target.value })}
                placeholder="Пояснение: почему подходит именно это слово (необязательно)"
              />
              <button
                type="button"
                className="icon-btn"
                title="Убрать контекст"
                onClick={() => set({ contexts: d.contexts.filter((_, j) => j !== i) })}
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
        <div>
          <button
            type="button"
            className="btn btn-small"
            onClick={() => set({ contexts: [...d.contexts, { text: '', answer: '', distractors: '', note: '' }] })}
          >
            <Plus size={14} aria-hidden="true" /> Контекст
          </button>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Сохраняю…' : 'Сохранить'}
        </button>
        <button className="btn" type="button" onClick={onCancel}>
          Отмена
        </button>
        {d.id && (
          <button className="btn btn-danger push-right" type="button" disabled={busy} onClick={onDelete}>
            Удалить слово
          </button>
        )}
      </div>
    </form>
  )
}
