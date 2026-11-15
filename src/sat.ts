import type { MaterialKind, StudentStatus } from './types'

/** Домены и навыки секции Reading & Writing цифрового SAT. */
export const DOMAINS = [
  {
    id: 'craft',
    name: 'Craft and Structure',
    skills: [
      { id: 'words-in-context', name: 'Words in Context' },
      { id: 'text-structure', name: 'Text Structure and Purpose' },
      { id: 'cross-text', name: 'Cross-Text Connections' },
    ],
  },
  {
    id: 'info',
    name: 'Information and Ideas',
    skills: [
      { id: 'central-ideas', name: 'Central Ideas and Details' },
      { id: 'evidence-textual', name: 'Command of Evidence: Textual' },
      { id: 'evidence-quant', name: 'Command of Evidence: Quantitative' },
      { id: 'inferences', name: 'Inferences' },
    ],
  },
  {
    id: 'conventions',
    name: 'Standard English Conventions',
    skills: [
      { id: 'boundaries', name: 'Boundaries' },
      { id: 'form-structure-sense', name: 'Form, Structure, and Sense' },
    ],
  },
  {
    id: 'expression',
    name: 'Expression of Ideas',
    skills: [
      { id: 'rhetorical-synthesis', name: 'Rhetorical Synthesis' },
      { id: 'transitions', name: 'Transitions' },
    ],
  },
] as const

export const SKILLS = DOMAINS.flatMap((d) =>
  d.skills.map((s) => ({ id: s.id as string, name: s.name as string, domainId: d.id as string })),
)

export function skillName(id: string): string {
  return SKILLS.find((s) => s.id === id)?.name ?? id
}

export const STATUS_LABELS: Record<StudentStatus, string> = {
  lead: 'Заявка',
  active: 'Занимается',
  paused: 'Пауза',
  finished: 'Завершил',
}

export const STATUSES = Object.keys(STATUS_LABELS) as StudentStatus[]

/**
 * В интерфейсе сейчас два раздела: «Вопросы по категориям» (practice) и «Прошлые тесты» (test).
 * Остальные типы остаются в схеме для совместимости и показываются в «Другие материалы», если есть.
 */
export const MATERIAL_KIND_LABELS: Record<MaterialKind, string> = {
  practice: 'Вопросы по категориям',
  test: 'Прошлые тесты',
  vocab: 'Словарь',
  theory: 'Теория',
  video: 'Видео',
  other: 'Другое',
}

export const ACTIVE_MATERIAL_KINDS: MaterialKind[] = ['practice', 'test']

/** Ссылка для href: только http(s); «example.com/x» дополняется до https://. Иначе null. */
export function safeUrl(raw: string): string | null {
  const url = raw.trim()
  if (!url) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`
  try {
    const parsed = new URL(withScheme)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null
  } catch {
    return null
  }
}

export const MIN_SCORE = 200
export const MAX_SCORE = 800

/** Приводит ввод к допустимому баллу R&W (200–800, шаг 10) или null. */
export function parseScore(value: string): number | null {
  if (value.trim() === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const rounded = Math.round(n / 10) * 10
  return Math.min(MAX_SCORE, Math.max(MIN_SCORE, rounded))
}
