import type { StudentStatus } from './types'

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
