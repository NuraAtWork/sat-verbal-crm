import type { Material } from './types'

// Разбор названий и заметок сетов: номер сета и сложность (папка «Вопросы по категориям», методички).

export interface Difficulty {
  counts: Record<'Easy' | 'Medium' | 'Hard', number>
  total: number
  /** Преобладающая сложность для цветной полоски */
  main: 'easy' | 'medium' | 'hard' | 'none'
}

/** Разбирает «25 вопросов · 15 Easy, 10 Medium» из заметок сета. */
export function difficultyOf(notes: string): Difficulty {
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
export function setNumber(title: string): number | null {
  const m = title.match(/(?:set|сет)\s*(\d+)/i)
  return m ? Number(m[1]) : null
}

/** Сначала сеты с номерами по порядку, потом остальные материалы по названию. */
export function sortSets(sets: Material[]): Material[] {
  return [...sets].sort((a, b) => {
    const na = setNumber(a.title) ?? Infinity
    const nb = setNumber(b.title) ?? Infinity
    return na - nb || a.title.localeCompare(b.title, 'ru', { numeric: true })
  })
}
