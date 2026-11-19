import { useState, type MouseEvent, type ReactNode } from 'react'
import { supabase } from '../supabase'
import { lookupWord, type LookupResult } from '../vocab'
import './vocab.css'

// Разбор сданного задания: клик по слову в вопросе показывает его значение из словаря репетитора
// и ставит слово в очередь тренера; если слова в словаре нет — можно попросить его добавить.

type CaretDocument = Document & {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  caretRangeFromPoint?: (x: number, y: number) => Range | null
}

const isWordChar = (ch: string | undefined) => ch !== undefined && /[A-Za-z'’-]/.test(ch)

/** Английское слово под точкой клика (от 3 букв) или null. */
function wordAt(x: number, y: number): string | null {
  const doc = document as CaretDocument
  let node: Node | undefined
  let offset = 0
  const pos = doc.caretPositionFromPoint?.(x, y)
  if (pos) {
    node = pos.offsetNode
    offset = pos.offset
  } else {
    const range = doc.caretRangeFromPoint?.(x, y)
    if (range) {
      node = range.startContainer
      offset = range.startOffset
    }
  }
  if (!node || node.nodeType !== Node.TEXT_NODE) return null
  const text = node.textContent ?? ''
  let a = offset
  let b = offset
  while (a > 0 && isWordChar(text[a - 1])) a--
  while (b < text.length && isWordChar(text[b])) b++
  const word = text.slice(a, b).replace(/^['’-]+|['’-]+$/g, '')
  return word.length >= 3 ? word : null
}

interface Lookup {
  text: string
  busy: boolean
  result: LookupResult | null
  error: boolean
}

export function WordLookup({ token, children }: { token: string; children: ReactNode }) {
  const [lookup, setLookup] = useState<Lookup | null>(null)

  if (!supabase) return <>{children}</>
  const sb = supabase

  const run = (text: string, add: boolean) => {
    setLookup((prev) => ({ text, busy: true, result: add ? (prev?.result ?? null) : null, error: false }))
    lookupWord(sb, token, text, add).then(
      (result) => setLookup((prev) => (prev?.text === text ? { text, busy: false, result, error: false } : prev)),
      () => setLookup((prev) => (prev?.text === text ? { text, busy: false, result: null, error: true } : prev)),
    )
  }

  const onClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    // только текст вопроса; выделение мышью — не клик по слову
    if (!target.closest('.setq, .tp-explain') || window.getSelection()?.toString()) return
    const word = wordAt(e.clientX, e.clientY)
    if (word) run(word, false)
  }

  const r = lookup?.result
  return (
    <>
      <p className="wl-hint">Нажми на незнакомое слово — покажу значение и добавлю его в твой тренер слов.</p>
      <div onClick={onClick}>{children}</div>
      {lookup && (
        <div className="wl-sheet" role="dialog" aria-label={`Слово ${lookup.text}`}>
          <button className="wl-close" onClick={() => setLookup(null)} aria-label="Закрыть">
            ×
          </button>
          {lookup.error ? (
            <p>Словарь сейчас недоступен. Попробуй позже.</p>
          ) : !r ? (
            <p>
              <strong>{lookup.text}</strong> …
            </p>
          ) : r.found ? (
            <>
              <p className="wl-word">
                <strong>{r.word}</strong> {r.pos && <em>{r.pos}</em>}
              </p>
              <p>{r.definition}</p>
              {r.translation && <p className="wl-muted">{r.translation}</p>}
              {r.learning ? (
                <p className="wl-ok">Это слово уже есть в твоём тренере.</p>
              ) : r.queued ? (
                <p className="wl-ok">В очереди тренера ✓ — появится среди ближайших новых слов.</p>
              ) : (
                <button className="sbtn sbtn-primary" disabled={lookup.busy} onClick={() => run(lookup.text, true)}>
                  Добавить в мой тренер
                </button>
              )}
            </>
          ) : (
            <>
              <p>
                Слова <strong>{lookup.text}</strong> пока нет в словаре.
              </p>
              {r.requested ? (
                <p className="wl-ok">Просьба отправлена преподавателю ✓</p>
              ) : (
                <button className="sbtn" disabled={lookup.busy} onClick={() => run(lookup.text, true)}>
                  Попросить добавить
                </button>
              )}
            </>
          )}
        </div>
      )}
    </>
  )
}
