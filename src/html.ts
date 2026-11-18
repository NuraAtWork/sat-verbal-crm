import DOMPurify from 'dompurify'

/**
 * Санитизация HTML вопросов. Одна и та же для показа (QuestionView) и для сохранения
 * из редактора сетов: HTML + SVG (графики), без <style>.
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, svg: true },
    FORBID_TAGS: ['style'],
  })
}

/** Пустое ли поле: нет текста и нет картинок/графиков/таблиц. */
export function isBlankHtml(html: string): boolean {
  if (!html.trim()) return true
  const doc = new DOMParser().parseFromString(sanitizeHtml(html), 'text/html')
  if (doc.body.querySelector('img, svg, table')) return false
  return (doc.body.textContent ?? '').replace(/ /g, ' ').trim() === ''
}

/** Текст без тегов — для коротких подписей (свёрнутая карточка вопроса). */
export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(sanitizeHtml(html), 'text/html')
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Обычный текст → абзацы (пустая строка между абзацами, перенос строки → <br>). */
export function textToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

const DROP = new Set(['script', 'style', 'meta', 'link', 'title', 'head', 'template', 'noscript', 'iframe', 'object'])
const BLOCKS = new Set([
  'p',
  'div',
  'section',
  'article',
  'header',
  'footer',
  'blockquote',
  'pre',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
])
const KEEP = new Set(['ul', 'ol', 'li', 'sub', 'sup'])
const TABLE = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption'])

/**
 * Вставка из Word / Google Docs / сайтов: оставляем только смысловую разметку —
 * абзацы, жирный, курсив, подчёркивание, списки, индексы и таблицы. Стили, классы и шрифты
 * отбрасываем, но жирный/курсив/подчёркивание, заданные через style (так делает Google Docs),
 * превращаем в теги.
 */
export function cleanPastedHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  const conv = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent ?? '')
    if (node.nodeType !== Node.ELEMENT_NODE) return ''
    const el = node as HTMLElement
    const tag = el.tagName.toLowerCase()
    if (DROP.has(tag)) return ''
    if (tag === 'br') return '<br>'
    const inner = Array.from(el.childNodes).map(conv).join('')

    if (TABLE.has(tag)) {
      const span = ['colspan', 'rowspan']
        .filter((a) => el.hasAttribute(a) && /^\d+$/.test(el.getAttribute(a) ?? ''))
        .map((a) => ` ${a}="${el.getAttribute(a)}"`)
        .join('')
      return `<${tag}${span}>${inner}</${tag}>`
    }
    if (KEEP.has(tag)) return `<${tag}>${inner}</${tag}>`

    const st = el.style
    const weight = st.fontWeight
    const bold =
      tag === 'b' || tag === 'strong' || /^h[1-6]$/.test(tag)
        ? !/^(normal|[1-5]00)$/.test(weight)
        : /^(bold|bolder|[6-9]00)$/.test(weight)
    const italic = tag === 'i' || tag === 'em' ? st.fontStyle !== 'normal' : st.fontStyle === 'italic'
    const deco = `${st.textDecoration} ${st.textDecorationLine}`
    const underline = tag === 'u' || tag === 'ins' || /underline/.test(deco)

    let out = inner
    if (out.trim()) {
      if (underline) out = `<u>${out}</u>`
      if (italic) out = `<em>${out}</em>`
      if (bold) out = `<strong>${out}</strong>`
    }
    if (BLOCKS.has(tag)) {
      // Блок внутри блока не оборачиваем второй раз — иначе получится <p><p>
      if (/<(p|table|ul|ol)[\s>]/.test(inner)) return out
      return out.trim() ? `<p>${out}</p>` : ''
    }
    return out
  }

  return sanitizeHtml(Array.from(doc.body.childNodes).map(conv).join(''))
}

/** Для сохранения: санитизация + без пустых абзацев и переносов в конце (остаются после таблицы). */
export function cleanForSave(html: string): string {
  let out = sanitizeHtml(html)
  let prev
  do {
    prev = out
    out = out.replace(/(?:<p>(?:\s|&nbsp;|<br>)*<\/p>|<br>|\s)+$/, '')
  } while (out !== prev)
  return isBlankHtml(out) ? '' : out
}
