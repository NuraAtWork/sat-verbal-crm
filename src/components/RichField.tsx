import { Bold, Code, Columns3, Italic, Pilcrow, RemoveFormatting, Rows3, Table, Trash2, Underline } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState, type ClipboardEvent, type ReactNode } from 'react'
import { cleanPastedHtml, isBlankHtml, sanitizeHtml, textToHtml } from '../html'

interface Props {
  label: string
  value: string
  onChange: (html: string) => void
  /** Класс содержимого как в QuestionView (setq-stimulus / setq-stem / setq-ct) — поле выглядит как у ученика */
  contentClass: string
  placeholder?: string
  /** Таблицы нужны только в тексте-стимуле */
  allowTable?: boolean
  compact?: boolean
  invalid?: boolean
  /** Слева от поля (буква варианта) */
  prefix?: ReactNode
}

/**
 * Поле с лёгким форматированием: жирный, курсив, подчёркивание, абзацы, таблица,
 * плюс режим «HTML» для точной правки. Значение меняется только когда пользователь что-то
 * правит — нетронутое поле сохраняется ровно в том виде, в каком пришло из базы.
 */
export function RichField(props: Props) {
  const { value, onChange } = props
  const [mode, setMode] = useState<'visual' | 'html'>('visual')
  const [cell, setCell] = useState<HTMLTableCellElement | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  /** Последнее значение, которое мы сами положили в редактор или получили из него */
  const shown = useRef<string | null>(null)
  const labelId = useId()

  // Значение пришло снаружи (загрузка, режим HTML, дублирование) — перерисовываем содержимое.
  useLayoutEffect(() => {
    const el = ref.current
    if (mode !== 'visual' || !el) return
    if (shown.current !== value) {
      el.innerHTML = sanitizeHtml(value)
      shown.current = value
    }
  }, [value, mode])

  const emit = () => {
    const el = ref.current
    if (!el) return
    const html = isBlankHtml(el.innerHTML) ? '' : el.innerHTML
    shown.current = html
    onChange(html)
  }

  // Ячейка таблицы под курсором — показываем кнопки строк/столбцов.
  useEffect(() => {
    if (!props.allowTable || mode !== 'visual') return
    const onSel = () => {
      const node = document.getSelection()?.anchorNode
      const el = node instanceof Element ? node : node?.parentElement
      const td = el?.closest('td, th') as HTMLTableCellElement | null
      setCell(td && ref.current?.contains(td) ? td : null)
    }
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [props.allowTable, mode])

  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus()
    document.execCommand('defaultParagraphSeparator', false, 'p')
    document.execCommand(cmd, false, arg)
    emit()
  }

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    const html = e.clipboardData.getData('text/html')
    const text = e.clipboardData.getData('text/plain')
    const clean = html ? cleanPastedHtml(html) : textToHtml(text)
    // Одна строка без абзацев — вставляем как текст внутрь текущего абзаца
    const single = clean.match(/^<p>((?:(?!<\/?p[\s>]).)*)<\/p>$/s)
    exec('insertHTML', single ? single[1] : clean)
  }

  const insertTable = () => {
    const head = '<tr><th>Заголовок</th><th>Заголовок</th><th>Заголовок</th></tr>'
    const row = '<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>'
    exec('insertHTML', `<table><tbody>${head}${row}${row}</tbody></table><p><br></p>`)
  }

  /** Правка структуры таблицы прямо в DOM (у execCommand таких команд нет). */
  const tableOp = (op: 'row+' | 'row-' | 'col+' | 'col-' | 'del') => {
    if (!cell || !ref.current?.contains(cell)) return
    const tr = cell.parentElement as HTMLTableRowElement
    const table = cell.closest('table') as HTMLTableElement
    const col = cell.cellIndex
    if (op === 'row+') {
      const copy = tr.cloneNode(false) as HTMLTableRowElement
      for (let i = 0; i < tr.cells.length; i++) copy.insertCell().innerHTML = '&nbsp;'
      tr.after(copy)
    } else if (op === 'row-') {
      if (table.rows.length > 1) tr.remove()
    } else if (op === 'col+' || op === 'col-') {
      for (const r of Array.from(table.rows)) {
        const c = r.cells[Math.min(col, r.cells.length - 1)]
        if (!c) continue
        if (op === 'col+') {
          const n = document.createElement(c.tagName.toLowerCase())
          n.innerHTML = '&nbsp;'
          c.after(n)
        } else if (r.cells.length > 1) c.remove()
      }
    } else {
      table.remove()
    }
    setCell(null)
    emit()
  }

  const off = mode !== 'visual'
  return (
    <div className={`rte ${props.compact ? 'rte-compact' : ''} ${props.invalid ? 'is-invalid' : ''}`}>
      <div className="rte-head">
        <span className="rte-label" id={labelId}>
          {props.label}
        </span>
        <div className="rte-toolbar" role="toolbar" aria-label={`Форматирование: ${props.label}`}>
          <ToolBtn title="Жирный (Ctrl+B)" disabled={off} onClick={() => exec('bold')}>
            <Bold size={14} />
          </ToolBtn>
          <ToolBtn title="Курсив (Ctrl+I)" disabled={off} onClick={() => exec('italic')}>
            <Italic size={14} />
          </ToolBtn>
          <ToolBtn title="Подчёркнутый (Ctrl+U)" disabled={off} onClick={() => exec('underline')}>
            <Underline size={14} />
          </ToolBtn>
          {!props.compact && (
            <ToolBtn title="Абзац" disabled={off} onClick={() => exec('formatBlock', 'p')}>
              <Pilcrow size={14} />
            </ToolBtn>
          )}
          <ToolBtn title="Убрать форматирование" disabled={off} onClick={() => exec('removeFormat')}>
            <RemoveFormatting size={14} />
          </ToolBtn>
          {props.allowTable && (
            <>
              <span className="rte-sep" />
              <ToolBtn title="Вставить таблицу" disabled={off} onClick={insertTable}>
                <Table size={14} />
              </ToolBtn>
              {cell && (
                <>
                  <ToolBtn title="Добавить строку ниже" disabled={off} onClick={() => tableOp('row+')}>
                    <Rows3 size={14} />
                  </ToolBtn>
                  <ToolBtn title="Добавить столбец справа" disabled={off} onClick={() => tableOp('col+')}>
                    <Columns3 size={14} />
                  </ToolBtn>
                  <button
                    type="button"
                    className="rte-btn rte-text"
                    onMouseDown={keepFocus}
                    onClick={() => tableOp('row-')}
                  >
                    − строка
                  </button>
                  <button
                    type="button"
                    className="rte-btn rte-text"
                    onMouseDown={keepFocus}
                    onClick={() => tableOp('col-')}
                  >
                    − столбец
                  </button>
                  <ToolBtn title="Удалить таблицу" disabled={off} onClick={() => tableOp('del')}>
                    <Trash2 size={14} />
                  </ToolBtn>
                </>
              )}
            </>
          )}
          <span className="rte-sep" />
          <button
            type="button"
            className={`rte-btn rte-text ${mode === 'html' ? 'is-on' : ''}`}
            title="Править HTML напрямую"
            aria-pressed={mode === 'html'}
            onMouseDown={keepFocus}
            onClick={() => {
              setCell(null)
              shown.current = null
              setMode(mode === 'html' ? 'visual' : 'html')
            }}
          >
            <Code size={14} aria-hidden="true" /> HTML
          </button>
        </div>
      </div>
      <div className="rte-row">
        {props.prefix}
        {mode === 'visual' ? (
          <div
            ref={ref}
            className={`rte-area ${props.contentClass}`}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-labelledby={labelId}
            data-placeholder={props.placeholder}
            onInput={emit}
            onPaste={onPaste}
            onFocus={() => document.execCommand('defaultParagraphSeparator', false, 'p')}
          />
        ) : (
          <textarea
            className="input rte-source"
            aria-labelledby={labelId}
            spellCheck={false}
            rows={props.compact ? 2 : 6}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </div>
    </div>
  )
}

/** Кнопки панели не забирают фокус и выделение у поля */
const keepFocus = (e: { preventDefault: () => void }) => e.preventDefault()

function ToolBtn(props: { title: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className="rte-btn"
      title={props.title}
      aria-label={props.title}
      onMouseDown={keepFocus}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.children}
    </button>
  )
}
