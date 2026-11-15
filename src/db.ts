import type { Db, Lesson, ScoreEntry, Student } from './types'

export const STORAGE_KEY = 'sat-verbal-crm:v1'

export const emptyDb = (): Db => ({ version: 1, students: [], lessons: [], scores: [] })

export function isDb(value: unknown): value is Db {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    v.version === 1 &&
    Array.isArray(v.students) &&
    Array.isArray(v.lessons) &&
    Array.isArray(v.scores)
  )
}

export function load(): Db {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyDb()
    const parsed: unknown = JSON.parse(raw)
    return isDb(parsed) ? parsed : emptyDb()
  } catch {
    return emptyDb()
  }
}

export type Action =
  | { type: 'student/upsert'; student: Student }
  | { type: 'student/delete'; id: string }
  | { type: 'lesson/upsert'; lesson: Lesson }
  | { type: 'lesson/delete'; id: string }
  | { type: 'score/upsert'; score: ScoreEntry }
  | { type: 'score/delete'; id: string }
  | { type: 'db/replace'; db: Db }

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id)
  if (i === -1) return [...list, item]
  const copy = list.slice()
  copy[i] = item
  return copy
}

export function reducer(db: Db, action: Action): Db {
  switch (action.type) {
    case 'student/upsert':
      return { ...db, students: upsert(db.students, action.student) }
    case 'student/delete':
      return {
        ...db,
        students: db.students.filter((s) => s.id !== action.id),
        lessons: db.lessons.filter((l) => l.studentId !== action.id),
        scores: db.scores.filter((s) => s.studentId !== action.id),
      }
    case 'lesson/upsert':
      return { ...db, lessons: upsert(db.lessons, action.lesson) }
    case 'lesson/delete':
      return { ...db, lessons: db.lessons.filter((l) => l.id !== action.id) }
    case 'score/upsert':
      return { ...db, scores: upsert(db.scores, action.score) }
    case 'score/delete':
      return { ...db, scores: db.scores.filter((s) => s.id !== action.id) }
    case 'db/replace':
      return action.db
  }
}

export const newId = () => crypto.randomUUID()

/** Пробные тесты ученика по возрастанию даты. */
export function scoresOf(db: Db, studentId: string): ScoreEntry[] {
  return db.scores
    .filter((s) => s.studentId === studentId)
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** Уроки ученика, новые сверху. */
export function lessonsOf(db: Db, studentId: string): Lesson[] {
  return db.lessons
    .filter((l) => l.studentId === studentId)
    .sort((a, b) => b.date.localeCompare(a.date))
}

export function latestScore(db: Db, studentId: string): number | null {
  const list = scoresOf(db, studentId)
  return list.length ? list[list.length - 1].score : null
}
