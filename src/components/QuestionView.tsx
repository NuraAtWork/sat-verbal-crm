import DOMPurify from 'dompurify'
import { useMemo } from 'react'
import type { SetQuestion } from '../types'

/** HTML вопроса из базы: дополнительно чистим в браузере (HTML + SVG для графиков). */
function Html({ html, className }: { html: string; className?: string }) {
  const clean = useMemo(
    () => DOMPurify.sanitize(html, { USE_PROFILES: { html: true, svg: true }, FORBID_TAGS: ['style'] }),
    [html],
  )
  if (!clean) return null
  return <div className={className} dangerouslySetInnerHTML={{ __html: clean }} />
}

interface Props {
  q: SetQuestion
  /** Номер, который показываем (по умолчанию q.n) */
  number?: number
  /** Выбранный ответ (ученик) */
  selected?: string | null
  /** Клик по варианту — только в режиме решения */
  onSelect?: (letter: string) => void
  /** Правильный ответ — показываем в разборе и репетитору */
  correct?: string
  showDifficulty?: boolean
}

export function QuestionView({ q, number, selected, onSelect, correct, showDifficulty }: Props) {
  return (
    <div className="setq">
      <div className="setq-num">
        {number ?? q.n}
        {showDifficulty && q.difficulty && (
          <span className={`diff diff-${q.difficulty.toLowerCase()}`}>{q.difficulty}</span>
        )}
      </div>
      <Html className="setq-stimulus" html={q.stimulus} />
      <Html className="setq-stem" html={q.stem} />
      <ol className="setq-choices">
        {q.choices.map((c) => {
          const isSelected = selected === c.letter
          const isCorrect = correct !== undefined && c.letter === correct
          const isWrongPick = correct !== undefined && isSelected && !isCorrect
          const cls = [
            'setq-choice',
            isSelected ? 'is-selected' : '',
            isCorrect ? 'is-correct' : '',
            isWrongPick ? 'is-wrong' : '',
            onSelect ? 'is-clickable' : '',
          ].join(' ')
          const body = (
            <>
              <span className="setq-ltr">{c.letter}</span>
              <Html className="setq-ct" html={c.html} />
              {isCorrect && <span className="setq-mark">✓</span>}
              {isWrongPick && <span className="setq-mark">✗</span>}
            </>
          )
          return (
            <li key={c.letter}>
              {onSelect ? (
                <button type="button" className={cls} onClick={() => onSelect(c.letter)} aria-pressed={isSelected}>
                  {body}
                </button>
              ) : (
                <div className={cls}>{body}</div>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
