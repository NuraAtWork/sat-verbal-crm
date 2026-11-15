import type { Db, Lesson, Material, ScoreEntry, Student } from './types'

export const STORAGE_KEY = 'sat-verbal-crm:v1'

export const emptyDb = (): Db => ({ version: 1, students: [], lessons: [], scores: [], materials: [] })

/**
 * Проверяет сохранённые/импортированные данные и дополняет поля,
 * которых не было в старых версиях (например, materials). null — если формат чужой.
 */
export function normalizeDb(value: unknown): Db | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (v.version !== 1 || !Array.isArray(v.students) || !Array.isArray(v.lessons) || !Array.isArray(v.scores)) {
    return null
  }
  return {
    version: 1,
    students: v.students as Student[],
    lessons: v.lessons as Lesson[],
    scores: v.scores as ScoreEntry[],
    materials: Array.isArray(v.materials) ? (v.materials as Material[]) : [],
  }
}

export function load(): Db {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyDb()
    return normalizeDb(JSON.parse(raw)) ?? emptyDb()
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
  | { type: 'material/upsert'; material: Material }
  | { type: 'material/delete'; id: string }
  | { type: 'db/replace'; db: Db }
  /** Добавить записи из db: с тем же id — обновить, новые — добавить, ничего не удалять */
  | { type: 'db/merge'; db: Db }

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
    case 'material/upsert':
      return { ...db, materials: upsert(db.materials, action.material) }
    case 'material/delete':
      return { ...db, materials: db.materials.filter((m) => m.id !== action.id) }
    case 'db/replace':
      return action.db
    case 'db/merge':
      return {
        ...db,
        students: action.db.students.reduce(upsert, db.students),
        lessons: action.db.lessons.reduce(upsert, db.lessons),
        scores: action.db.scores.reduce(upsert, db.scores),
        materials: action.db.materials.reduce(upsert, db.materials),
      }
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
